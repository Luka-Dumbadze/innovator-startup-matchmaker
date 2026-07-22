-- =============================================================================
-- Startup Matchmaker — Initial Schema + Atomic Assignment RPC
-- =============================================================================
-- Design goal: 40 students scan a QR at once and each must land in an open
-- team slot (max 5 per team, 8 teams = 40) with ZERO capacity overshoots.
--
-- Atomic Concurrency strategy (assign_player_atomically):
--   1. Idempotency check — same player re-scanning returns their existing team.
--   2. Lock EVERY team row for the session with SELECT … FOR UPDATE, ordered by
--      team_number so lock acquisition is always consistent (no deadlocks).
--   3. Pick the first team where current_count < max_capacity.
--   4. Increment current_count + INSERT player_assignments in the same TX.
--   5. UNIQUE(session_id, player_uid) is the final safety net if two identical
--      requests race past the idempotency read before either commits.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- daily_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE daily_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_label  TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup of the currently active morning session (realtime dashboards).
CREATE INDEX idx_daily_sessions_is_active
  ON daily_sessions (is_active)
  WHERE is_active = TRUE;

-- At most one active session at a time.
CREATE UNIQUE INDEX uq_daily_sessions_single_active
  ON daily_sessions ((is_active))
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
CREATE TABLE teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES daily_sessions (id) ON DELETE CASCADE,
  team_number    SMALLINT NOT NULL CHECK (team_number BETWEEN 1 AND 8),
  name           TEXT NOT NULL,
  color          TEXT NOT NULL,
  words          TEXT[] NOT NULL,
  max_capacity   SMALLINT NOT NULL DEFAULT 5 CHECK (max_capacity > 0),
  -- Denormalized occupancy; mutated ONLY inside assign_player_atomically.
  current_count  SMALLINT NOT NULL DEFAULT 0
                   CHECK (current_count >= 0 AND current_count <= max_capacity),
  CONSTRAINT uq_teams_session_number UNIQUE (session_id, team_number),
  CONSTRAINT chk_teams_words_length CHECK (cardinality(words) = 4)
);

-- Ultra-fast real-time lookup: all teams for a session, ordered for fill logic.
CREATE INDEX idx_teams_session_id
  ON teams (session_id, team_number);

CREATE INDEX idx_teams_session_capacity
  ON teams (session_id)
  WHERE current_count < max_capacity;

-- ---------------------------------------------------------------------------
-- player_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE player_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES daily_sessions (id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  player_uid  TEXT NOT NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One assignment per student per session (idempotency + double-scan safety).
  CONSTRAINT uq_player_assignments_session_player UNIQUE (session_id, player_uid)
);

CREATE INDEX idx_player_assignments_session_id
  ON player_assignments (session_id);

CREATE INDEX idx_player_assignments_team_id
  ON player_assignments (team_id);

CREATE INDEX idx_player_assignments_player_uid
  ON player_assignments (player_uid);

-- ---------------------------------------------------------------------------
-- assign_player_atomically
-- ---------------------------------------------------------------------------
-- Called via supabase.rpc('assign_player_atomically', { p_session_id, p_player_uid })
-- Returns the assigned team row (JSONB-compatible record).
-- Raises:
--   SESSION_NOT_FOUND / SESSION_INACTIVE / SESSION_FULL / PLAYER_UID_REQUIRED
-- ---------------------------------------------------------------------------
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
  -- Lock ALL team rows for this session in team_number order.
  -- Every concurrent assigner queues on the same lock chain, so capacity
  -- checks and increments are strictly serialized for this session.
  -- -----------------------------------------------------------------------
  PERFORM 1
  FROM teams
  WHERE session_id = p_session_id
  ORDER BY team_number
  FOR UPDATE;

  -- First open slot (lowest team_number with room)
  SELECT * INTO v_team
  FROM teams
  WHERE session_id = p_session_id
    AND current_count < max_capacity
  ORDER BY team_number
  LIMIT 1;

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
  'Atomically assigns a player to the first open team slot in a daily session using FOR UPDATE row locks. Idempotent per (session_id, player_uid).';

-- Allow anon / authenticated clients to invoke the RPC (RLS still protects tables).
GRANT EXECUTE ON FUNCTION assign_player_atomically(UUID, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security (baseline — tighten in a later migration if needed)
-- ---------------------------------------------------------------------------
ALTER TABLE daily_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_assignments ENABLE ROW LEVEL SECURITY;

-- Public read of sessions / teams (QR join + mentor dashboards).
CREATE POLICY daily_sessions_select_all
  ON daily_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY teams_select_all
  ON teams FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY player_assignments_select_all
  ON player_assignments FOR SELECT
  TO anon, authenticated
  USING (true);

-- Direct writes blocked for clients; mutations go through SECURITY DEFINER RPC
-- or service-role mentor tooling. No INSERT/UPDATE/DELETE policies for anon.

-- ---------------------------------------------------------------------------
-- Seed: Day 1 — Summer School (8 teams × 4 words × capacity 5 = 40 seats)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_session_id UUID;
BEGIN
  INSERT INTO daily_sessions (date_label, is_active)
  VALUES ('Day 1 - Summer School', TRUE)
  RETURNING id INTO v_session_id;

  INSERT INTO teams (session_id, team_number, name, color, words, max_capacity, current_count)
  VALUES
    (v_session_id, 1, 'Spark',     '#E63946', ARRAY['ideate',  'prototype', 'pitch',    'iterate'],  5, 0),
    (v_session_id, 2, 'Velocity',  '#F4A261', ARRAY['launch',  'traction',  'growth',   'scale'],    5, 0),
    (v_session_id, 3, 'Orbit',     '#2A9D8F', ARRAY['market',  'customer',  'insight',  'validate'], 5, 0),
    (v_session_id, 4, 'Forge',     '#264653', ARRAY['build',   'ship',      'feedback', 'refine'],   5, 0),
    (v_session_id, 5, 'Nova',      '#9B5DE5', ARRAY['vision',  'mission',   'brand',    'story'],    5, 0),
    (v_session_id, 6, 'Pulse',     '#00BBF9', ARRAY['team',    'culture',   'roles',    'trust'],    5, 0),
    (v_session_id, 7, 'Catalyst',  '#FEE440', ARRAY['problem', 'solution',  'value',    'impact'],   5, 0),
    (v_session_id, 8, 'Horizon',   '#00F5D4', ARRAY['future',  'tech',      'disrupt',  'adapt'],    5, 0);
END;
$$;
