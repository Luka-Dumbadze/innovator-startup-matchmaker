-- =============================================================================
-- Standalone XY-Game (Win-Win Simulation)
-- =============================================================================
-- Independent of daily_sessions / teams: mentors run rounds, students tap X or Y
-- on their phones, and each team also submits one paper decision per round.

CREATE TABLE IF NOT EXISTS xy_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL DEFAULT 'XY თამაში',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'active',
  current_round INT NOT NULL DEFAULT 1 CHECK (current_round >= 1),
  voting_open   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL until the mentor retires the session; set alongside status='completed'.
  ended_at      TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT xy_sessions_status_allowed CHECK (status IN ('active', 'completed')),
  -- The two liveness flags are always read together, so they may never drift.
  CONSTRAINT xy_sessions_status_matches_is_active CHECK (
    (is_active AND status = 'active') OR (NOT is_active AND status = 'completed')
  )
);

-- Upgrade path for databases created before `label` / `status` / `ended_at` existed.
ALTER TABLE xy_sessions
  ADD COLUMN IF NOT EXISTS label TEXT DEFAULT 'XY თამაში',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ DEFAULT NULL;

-- Every screen renders `label`, so it must always hold a non-empty value.
UPDATE xy_sessions
SET label = 'XY თამაში'
WHERE label IS NULL
   OR btrim(label) = '';

ALTER TABLE xy_sessions
  ALTER COLUMN label SET DEFAULT 'XY თამაში',
  ALTER COLUMN label SET NOT NULL;

UPDATE xy_sessions
SET status = CASE WHEN is_active THEN 'active' ELSE 'completed' END
WHERE status IS DISTINCT FROM CASE WHEN is_active THEN 'active' ELSE 'completed' END;

-- Retired rows imported before `ended_at` existed still need a close timestamp.
UPDATE xy_sessions
SET ended_at = COALESCE(ended_at, now())
WHERE is_active = FALSE
  AND ended_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xy_sessions_status_allowed'
  ) THEN
    ALTER TABLE xy_sessions
      ADD CONSTRAINT xy_sessions_status_allowed CHECK (status IN ('active', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xy_sessions_status_matches_is_active'
  ) THEN
    ALTER TABLE xy_sessions
      ADD CONSTRAINT xy_sessions_status_matches_is_active CHECK (
        (is_active AND status = 'active') OR (NOT is_active AND status = 'completed')
      );
  END IF;
END;
$$;

-- Serves the canonical lookup: is_active = TRUE AND status = 'active'.
DROP INDEX IF EXISTS idx_xy_sessions_active;
CREATE INDEX IF NOT EXISTS idx_xy_sessions_active
  ON xy_sessions (is_active, status, created_at DESC)
  WHERE is_active = TRUE AND status = 'active';

CREATE TABLE IF NOT EXISTS xy_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  team_number INT NOT NULL CHECK (team_number BETWEEN 1 AND 8),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#2563EB',
  CONSTRAINT uq_xy_teams_session_number UNIQUE (session_id, team_number)
);

CREATE TABLE IF NOT EXISTS xy_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  player_uid TEXT NOT NULL,
  full_name  TEXT NOT NULL,
  team_id    UUID REFERENCES xy_teams (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_players_session_uid UNIQUE (session_id, player_uid)
);

CREATE INDEX IF NOT EXISTS idx_xy_players_team ON xy_players (team_id);

-- One phone vote per student per round.
CREATE TABLE IF NOT EXISTS xy_individual_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  round_number INT NOT NULL CHECK (round_number >= 1),
  player_id    UUID NOT NULL REFERENCES xy_players (id) ON DELETE CASCADE,
  vote         TEXT NOT NULL CHECK (vote IN ('X', 'Y')),
  edited_by_mentor BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_individual_votes UNIQUE (session_id, round_number, player_id)
);

CREATE INDEX IF NOT EXISTS idx_xy_individual_votes_round
  ON xy_individual_votes (session_id, round_number);

-- One paper decision per team per round (mentor entered).
CREATE TABLE IF NOT EXISTS xy_team_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  round_number INT NOT NULL CHECK (round_number >= 1),
  team_id      UUID NOT NULL REFERENCES xy_teams (id) ON DELETE CASCADE,
  vote         TEXT NOT NULL CHECK (vote IN ('X', 'Y')),
  points       INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_team_votes UNIQUE (session_id, round_number, team_id)
);

CREATE INDEX IF NOT EXISTS idx_xy_team_votes_round
  ON xy_team_votes (session_id, round_number);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
ALTER TABLE xy_sessions REPLICA IDENTITY FULL;
ALTER TABLE xy_teams REPLICA IDENTITY FULL;
ALTER TABLE xy_players REPLICA IDENTITY FULL;
ALTER TABLE xy_individual_votes REPLICA IDENTITY FULL;
ALTER TABLE xy_team_votes REPLICA IDENTITY FULL;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'xy_sessions', 'xy_teams', 'xy_players', 'xy_individual_votes', 'xy_team_votes'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', v_table);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: public read, writes only through SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE xy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE xy_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE xy_individual_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE xy_team_votes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'xy_sessions', 'xy_teams', 'xy_players', 'xy_individual_votes', 'xy_team_votes'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_table || '_select_all', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)',
      v_table || '_select_all',
      v_table
    );
  END LOOP;
END;
$$;

/**
 * Student joins the active XY session with their real name.
 * Idempotent per (session_id, player_uid) — refreshes the name on re-join.
 */
CREATE OR REPLACE FUNCTION xy_join_player(
  p_session_id UUID,
  p_player_uid TEXT,
  p_full_name  TEXT
)
RETURNS xy_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    TEXT := btrim(COALESCE(p_player_uid, ''));
  v_name   TEXT := btrim(COALESCE(p_full_name, ''));
  v_player xy_players%ROWTYPE;
BEGIN
  IF v_uid = '' THEN
    RAISE EXCEPTION 'PLAYER_UID_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'FULL_NAME_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM xy_sessions
    WHERE id = p_session_id
      AND is_active = TRUE
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'XY_SESSION_NOT_ACTIVE: %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO xy_players (session_id, player_uid, full_name)
  VALUES (p_session_id, v_uid, v_name)
  ON CONFLICT (session_id, player_uid)
  DO UPDATE SET full_name = EXCLUDED.full_name
  RETURNING * INTO v_player;

  RETURN v_player;
END;
$$;

COMMENT ON FUNCTION xy_join_player(UUID, TEXT, TEXT) IS
  'Idempotent XY-game roster join keyed by (session_id, player_uid).';

GRANT EXECUTE ON FUNCTION xy_join_player(UUID, TEXT, TEXT) TO anon, authenticated;

/**
 * Student casts (or changes) their phone vote for the session's OPEN round.
 * Rejects writes while the mentor has voting closed.
 */
CREATE OR REPLACE FUNCTION xy_cast_individual_vote(
  p_session_id UUID,
  p_player_uid TEXT,
  p_vote       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   xy_sessions%ROWTYPE;
  v_player_id UUID;
  v_vote      TEXT := upper(btrim(COALESCE(p_vote, '')));
BEGIN
  IF v_vote NOT IN ('X', 'Y') THEN
    RAISE EXCEPTION 'INVALID_VOTE: expected X or Y, got %', p_vote
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_session
  FROM xy_sessions
  WHERE id = p_session_id
    AND is_active = TRUE
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'XY_SESSION_NOT_ACTIVE: %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_session.voting_open THEN
    RAISE EXCEPTION 'XY_VOTING_CLOSED: round % is not open', v_session.current_round
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_player_id
  FROM xy_players
  WHERE session_id = p_session_id
    AND player_uid = btrim(COALESCE(p_player_uid, ''));

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'XY_PLAYER_NOT_FOUND: join the session first'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO xy_individual_votes (session_id, round_number, player_id, vote)
  VALUES (p_session_id, v_session.current_round, v_player_id, v_vote)
  ON CONFLICT (session_id, round_number, player_id)
  DO UPDATE SET
    vote = EXCLUDED.vote,
    edited_by_mentor = FALSE,
    updated_at = now();

  RETURN jsonb_build_object(
    'round_number', v_session.current_round,
    'player_id', v_player_id,
    'vote', v_vote
  );
END;
$$;

COMMENT ON FUNCTION xy_cast_individual_vote(UUID, TEXT, TEXT) IS
  'Upserts a student phone vote (X/Y) for the currently open XY round.';

GRANT EXECUTE ON FUNCTION xy_cast_individual_vote(UUID, TEXT, TEXT) TO anon, authenticated;
