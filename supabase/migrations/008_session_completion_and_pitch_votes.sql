-- =============================================================================
-- Session completion + live pitch audience voting
-- =============================================================================

ALTER TABLE daily_sessions
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

COMMENT ON COLUMN daily_sessions.ended_at IS
  'When the mentor ended (completed) this session; null while still open/active.';

ALTER TABLE submitted_ideas
  ADD COLUMN IF NOT EXISTS likes_count INT NOT NULL DEFAULT 0
    CHECK (likes_count >= 0),
  ADD COLUMN IF NOT EXISTS dislikes_count INT NOT NULL DEFAULT 0
    CHECK (dislikes_count >= 0);

COMMENT ON COLUMN submitted_ideas.likes_count IS
  'Audience 👍 votes for this pitch (denormalized from pitch_votes).';
COMMENT ON COLUMN submitted_ideas.dislikes_count IS
  'Audience 👎 votes for this pitch (denormalized from pitch_votes).';

CREATE TABLE IF NOT EXISTS pitch_votes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES daily_sessions (id) ON DELETE CASCADE,
  team_id           UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  voter_player_uid  TEXT NOT NULL,
  vote_type         TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pitch_votes_session_team_voter
    UNIQUE (session_id, team_id, voter_player_uid)
);

CREATE INDEX IF NOT EXISTS idx_pitch_votes_session_team
  ON pitch_votes (session_id, team_id);

CREATE INDEX IF NOT EXISTS idx_pitch_votes_team_type
  ON pitch_votes (team_id, vote_type);

ALTER TABLE pitch_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pitch_votes_select_all ON pitch_votes;
CREATE POLICY pitch_votes_select_all
  ON pitch_votes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS pitch_votes_insert_anon ON pitch_votes;
CREATE POLICY pitch_votes_insert_anon
  ON pitch_votes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS pitch_votes_update_anon ON pitch_votes;
CREATE POLICY pitch_votes_update_anon
  ON pitch_votes FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Live tallies on host TV
ALTER TABLE submitted_ideas REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE submitted_ideas;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END;
$$;

/**
 * Insert or change a student's like/dislike for a team's pitch, then
 * recount likes_count / dislikes_count on the team's final submitted idea.
 */
CREATE OR REPLACE FUNCTION cast_pitch_vote(
  p_session_id UUID,
  p_team_id    UUID,
  p_voter_uid  TEXT,
  p_vote_type  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voter   TEXT := btrim(COALESCE(p_voter_uid, ''));
  v_type    TEXT := lower(btrim(COALESCE(p_vote_type, '')));
  v_likes   INT;
  v_dislikes INT;
BEGIN
  IF p_session_id IS NULL OR p_team_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AND_TEAM_REQUIRED'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_voter = '' THEN
    RAISE EXCEPTION 'VOTER_UID_REQUIRED: p_voter_uid must be a non-empty string'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_type NOT IN ('like', 'dislike') THEN
    RAISE EXCEPTION 'INVALID_VOTE_TYPE: expected like or dislike, got %', p_vote_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM daily_sessions WHERE id = p_session_id
  ) THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE id = p_team_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: % in session %', p_team_id, p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO pitch_votes (session_id, team_id, voter_player_uid, vote_type)
  VALUES (p_session_id, p_team_id, v_voter, v_type)
  ON CONFLICT (session_id, team_id, voter_player_uid)
  DO UPDATE SET
    vote_type = EXCLUDED.vote_type,
    created_at = now();

  SELECT
    COUNT(*) FILTER (WHERE vote_type = 'like')::INT,
    COUNT(*) FILTER (WHERE vote_type = 'dislike')::INT
  INTO v_likes, v_dislikes
  FROM pitch_votes
  WHERE session_id = p_session_id
    AND team_id = p_team_id;

  UPDATE submitted_ideas
  SET likes_count = v_likes,
      dislikes_count = v_dislikes
  WHERE session_id = p_session_id
    AND team_id = p_team_id
    AND is_final_team_pitch = TRUE;

  RETURN jsonb_build_object(
    'likes_count', v_likes,
    'dislikes_count', v_dislikes,
    'vote_type', v_type
  );
END;
$$;

COMMENT ON FUNCTION cast_pitch_vote(UUID, UUID, TEXT, TEXT) IS
  'Upserts an audience like/dislike for a team pitch and syncs denormalized tallies on submitted_ideas.';

GRANT EXECUTE ON FUNCTION cast_pitch_vote(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
