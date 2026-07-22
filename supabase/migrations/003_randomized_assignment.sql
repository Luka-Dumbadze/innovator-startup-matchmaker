-- =============================================================================
-- Randomized atomic assignment
-- =============================================================================
-- Replaces sequential fill (ORDER BY team_number) with randomization-first
-- placement among teams that still have open seats.
--
-- Concurrency safety (unchanged):
--   1. Idempotency check for (session_id, player_uid)
--   2. Lock ALL session team rows with FOR UPDATE in team_number order
--      (stable lock order → no deadlocks under 40 concurrent joins)
--   3. Pick one open team with ORDER BY RANDOM() LIMIT 1
--   4. Increment current_count + INSERT assignment in the same transaction
--   5. UNIQUE(session_id, player_uid) + unique_violation handler as safety net
-- =============================================================================

CREATE OR REPLACE FUNCTION assign_player_atomically(
  p_session_id  UUID,
  p_player_uid  TEXT
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
BEGIN
  -- Guard: non-empty player identity
  IF p_player_uid IS NULL OR btrim(p_player_uid) = '' THEN
    RAISE EXCEPTION 'PLAYER_UID_REQUIRED: p_player_uid must be a non-empty string'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Guard: session must exist and be the active morning session
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

  -- -----------------------------------------------------------------------
  -- IDEMPOTENCY: player already assigned → return their team (no capacity burn)
  -- -----------------------------------------------------------------------
  SELECT team_id INTO v_existing_id
  FROM player_assignments
  WHERE session_id = p_session_id
    AND player_uid = p_player_uid;

  IF v_existing_id IS NOT NULL THEN
    SELECT * INTO v_team FROM teams WHERE id = v_existing_id;
    RETURN v_team;
  END IF;

  -- -----------------------------------------------------------------------
  -- ROW-LEVEL LOCKING
  -- Lock ALL team rows for this session in a stable order (team_number).
  -- Prevents deadlocks when many assigners run concurrently, then we pick
  -- randomly among the already-locked open seats below.
  -- -----------------------------------------------------------------------
  PERFORM 1
  FROM teams
  WHERE session_id = p_session_id
  ORDER BY team_number
  FOR UPDATE;

  -- Randomization-first: any open team, not lowest team_number
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

  -- Atomic occupancy bump + assignment insert (same transaction)
  UPDATE teams
  SET current_count = current_count + 1
  WHERE id = v_team.id
  RETURNING * INTO v_team;

  BEGIN
    INSERT INTO player_assignments (session_id, team_id, player_uid)
    VALUES (p_session_id, v_team.id, p_player_uid);
  EXCEPTION
    -- Twin requests for the same player both passed the early idempotency
    -- read; the UNIQUE constraint wins — roll back the capacity bump we just
    -- did for the loser and return the winner's team.
    WHEN unique_violation THEN
      UPDATE teams
      SET current_count = current_count - 1
      WHERE id = v_team.id;

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

COMMENT ON FUNCTION assign_player_atomically(UUID, TEXT) IS
  'Atomically assigns a player to a random open team slot in a daily session using FOR UPDATE row locks. Idempotent per (session_id, player_uid).';

GRANT EXECUTE ON FUNCTION assign_player_atomically(UUID, TEXT) TO anon, authenticated;
