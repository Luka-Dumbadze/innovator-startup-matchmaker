-- =============================================================================
-- Mentor-controlled audience voting state on daily_sessions
-- =============================================================================

ALTER TABLE daily_sessions
  ADD COLUMN IF NOT EXISTS voting_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voting_team_id UUID REFERENCES teams (id) ON DELETE SET NULL;

COMMENT ON COLUMN daily_sessions.voting_open IS
  'Mentor-controlled flag: true while audience may cast pitch votes.';
COMMENT ON COLUMN daily_sessions.voting_team_id IS
  'Team currently being voted on; null when voting is closed.';

CREATE INDEX IF NOT EXISTS idx_daily_sessions_voting_open
  ON daily_sessions (voting_open)
  WHERE voting_open = TRUE;

-- Ensure clients receive voting_open / voting_team_id updates over Realtime.
ALTER TABLE daily_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END;
$$;

/**
 * Mentor opens or closes audience voting for a session.
 * SECURITY DEFINER so the host TV (anon key) can update without a broad UPDATE policy.
 */
CREATE OR REPLACE FUNCTION set_session_voting_state(
  p_session_id UUID,
  p_voting_open BOOLEAN,
  p_voting_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session daily_sessions%ROWTYPE;
  v_team_id UUID;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGS: session_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session
  FROM daily_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: no daily_sessions row for %', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  IF p_voting_open THEN
    IF p_voting_team_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGS: voting_team_id is required when opening voting'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM teams
      WHERE id = p_voting_team_id AND session_id = p_session_id
    ) THEN
      RAISE EXCEPTION 'TEAM_NOT_FOUND: team % not in session %', p_voting_team_id, p_session_id
        USING ERRCODE = 'P0001';
    END IF;

    v_team_id := p_voting_team_id;

    UPDATE daily_sessions
    SET voting_open = TRUE,
        voting_team_id = v_team_id
    WHERE id = p_session_id;
  ELSE
    v_team_id := NULL;

    UPDATE daily_sessions
    SET voting_open = FALSE,
        voting_team_id = NULL
    WHERE id = p_session_id;
  END IF;

  RETURN json_build_object(
    'session_id', p_session_id,
    'voting_open', p_voting_open,
    'voting_team_id', v_team_id
  );
END;
$$;

COMMENT ON FUNCTION set_session_voting_state(UUID, BOOLEAN, UUID) IS
  'Mentor opens (voting_open=true + team) or closes (voting_open=false, team null) audience voting.';

GRANT EXECUTE ON FUNCTION set_session_voting_state(UUID, BOOLEAN, UUID) TO anon, authenticated;
