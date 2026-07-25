-- =============================================================================
-- Player profiles (real name + nickname) & submitted ideas
-- =============================================================================

ALTER TABLE player_assignments
  ADD COLUMN IF NOT EXISTS real_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN player_assignments.real_name IS
  'Private real name for mentor tracking.';
COMMENT ON COLUMN player_assignments.nickname IS
  'Public nickname shown to teammates.';

CREATE TABLE IF NOT EXISTS submitted_ideas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES daily_sessions (id) ON DELETE CASCADE,
  team_id               UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  author_player_uid     TEXT NOT NULL,
  author_nickname       TEXT NOT NULL,
  startup_name          TEXT NOT NULL,
  one_sentence_solution TEXT NOT NULL,
  tools_integration     TEXT NOT NULL,
  is_final_team_pitch   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submitted_ideas_session_id
  ON submitted_ideas (session_id);

CREATE INDEX IF NOT EXISTS idx_submitted_ideas_team_id
  ON submitted_ideas (team_id);

-- One final team pitch per team per session
CREATE UNIQUE INDEX IF NOT EXISTS uq_submitted_ideas_final_team
  ON submitted_ideas (session_id, team_id)
  WHERE is_final_team_pitch = TRUE;

-- One personal draft row per author per session (non-final optional tracking)
CREATE UNIQUE INDEX IF NOT EXISTS uq_submitted_ideas_author_session
  ON submitted_ideas (session_id, author_player_uid)
  WHERE is_final_team_pitch = FALSE;

ALTER TABLE submitted_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS submitted_ideas_select_all ON submitted_ideas;
CREATE POLICY submitted_ideas_select_all
  ON submitted_ideas FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS submitted_ideas_insert_anon ON submitted_ideas;
CREATE POLICY submitted_ideas_insert_anon
  ON submitted_ideas FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS submitted_ideas_update_anon ON submitted_ideas;
CREATE POLICY submitted_ideas_update_anon
  ON submitted_ideas FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Replace 2-arg RPC with profile-aware 4-arg version (keeps randomized seating).
DROP FUNCTION IF EXISTS assign_player_atomically(UUID, TEXT);

CREATE OR REPLACE FUNCTION assign_player_atomically(
  p_session_id  UUID,
  p_player_uid  TEXT,
  p_real_name   TEXT DEFAULT '',
  p_nickname    TEXT DEFAULT ''
)
RETURNS teams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session     daily_sessions%ROWTYPE;
  v_existing_id UUID;
  v_team        teams%ROWTYPE;
  v_real_name   TEXT := btrim(COALESCE(p_real_name, ''));
  v_nickname    TEXT := btrim(COALESCE(p_nickname, ''));
BEGIN
  IF p_player_uid IS NULL OR btrim(p_player_uid) = '' THEN
    RAISE EXCEPTION 'PLAYER_UID_REQUIRED: p_player_uid must be a non-empty string'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_real_name = '' THEN
    RAISE EXCEPTION 'REAL_NAME_REQUIRED: p_real_name must be a non-empty string'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_nickname = '' THEN
    RAISE EXCEPTION 'NICKNAME_REQUIRED: p_nickname must be a non-empty string'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_session
  FROM daily_sessions
  WHERE id = p_session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: no daily_sessions row for %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_session.is_active THEN
    RAISE EXCEPTION 'SESSION_INACTIVE: session % is not active', p_session_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: already assigned → refresh profile fields, return team
  SELECT team_id INTO v_existing_id
  FROM player_assignments
  WHERE session_id = p_session_id
    AND player_uid = p_player_uid;

  IF v_existing_id IS NOT NULL THEN
    UPDATE player_assignments
    SET real_name = v_real_name,
        nickname = v_nickname
    WHERE session_id = p_session_id
      AND player_uid = p_player_uid;

    SELECT * INTO v_team FROM teams WHERE id = v_existing_id;
    RETURN v_team;
  END IF;

  PERFORM 1
  FROM teams
  WHERE session_id = p_session_id
  ORDER BY team_number
  FOR UPDATE;

  SELECT * INTO v_team
  FROM teams
  WHERE session_id = p_session_id
    AND current_count < max_capacity
  ORDER BY RANDOM()
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_FULL: all teams are at capacity (40/40) for session %', p_session_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE teams
  SET current_count = current_count + 1
  WHERE id = v_team.id
  RETURNING * INTO v_team;

  BEGIN
    INSERT INTO player_assignments (
      session_id, team_id, player_uid, real_name, nickname
    )
    VALUES (
      p_session_id, v_team.id, p_player_uid, v_real_name, v_nickname
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE teams
      SET current_count = current_count - 1
      WHERE id = v_team.id;

      UPDATE player_assignments
      SET real_name = v_real_name,
          nickname = v_nickname
      WHERE session_id = p_session_id
        AND player_uid = p_player_uid;

      SELECT t.* INTO v_team
      FROM player_assignments pa
      JOIN teams t ON t.id = pa.team_id
      WHERE pa.session_id = p_session_id
        AND pa.player_uid = p_player_uid;

      RETURN v_team;
  END;

  RETURN v_team;
END;
$$;

COMMENT ON FUNCTION assign_player_atomically(UUID, TEXT, TEXT, TEXT) IS
  'Atomically assigns a player (with real_name + nickname) to a random open team slot. Idempotent per (session_id, player_uid).';

GRANT EXECUTE ON FUNCTION assign_player_atomically(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
