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
  name        TEXT NOT NULL DEFAULT 'გუნდი',
  color       TEXT NOT NULL DEFAULT '#2563EB',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_teams_session_number UNIQUE (session_id, team_number)
);

-- Upgrade path for databases created before these columns / constraints existed.
ALTER TABLE xy_teams
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'გუნდი',
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#2563EB',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_xy_teams_session_number'
  ) THEN
    ALTER TABLE xy_teams
      ADD CONSTRAINT uq_xy_teams_session_number UNIQUE (session_id, team_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xy_teams_team_number_range'
  ) THEN
    ALTER TABLE xy_teams
      ADD CONSTRAINT xy_teams_team_number_range CHECK (team_number BETWEEN 1 AND 8);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_xy_teams_session
  ON xy_teams (session_id, team_number);

-- `full_name` is the XY-game column; `real_name` mirrors it because the rest of
-- this app (player_assignments, submitted_ideas) names the same field that way.
-- A trigger keeps the pair in lockstep so either name can be read or written.
CREATE TABLE IF NOT EXISTS xy_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  player_uid TEXT NOT NULL,
  full_name  TEXT NOT NULL,
  real_name  TEXT,
  -- team_id is the FK; team_number is a denormalized mirror so roster UIs and
  -- offline tooling can read the assignment without joining xy_teams.
  team_id    UUID REFERENCES xy_teams (id) ON DELETE CASCADE,
  team_number INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_players_session_uid UNIQUE (session_id, player_uid)
);

-- Upgrade path for databases that only have one of the two name columns.
ALTER TABLE xy_players
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS real_name TEXT,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS team_number INT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Prefer CASCADE over a legacy SET NULL so deleting a team removes its
-- roster seats rather than leaving orphaned team_id pointers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xy_players_team_id_fkey'
  ) THEN
    ALTER TABLE xy_players DROP CONSTRAINT xy_players_team_id_fkey;
  END IF;

  ALTER TABLE xy_players
    ADD CONSTRAINT xy_players_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES xy_teams (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Backfill team_number from the assigned team when only the FK is present.
UPDATE xy_players p
SET team_number = t.team_number
FROM xy_teams t
WHERE p.team_id = t.id
  AND (p.team_number IS DISTINCT FROM t.team_number);

-- And the reverse: resolve team_id when only the number was written.
UPDATE xy_players p
SET team_id = t.id
FROM xy_teams t
WHERE p.team_id IS NULL
  AND p.team_number IS NOT NULL
  AND t.session_id = p.session_id
  AND t.team_number = p.team_number;

/**
 * Keeps team_id and team_number in lockstep for every writer.
 * On UPDATE the column that actually changed wins; on INSERT whichever
 * column carries a value resolves the other.
 */
CREATE OR REPLACE FUNCTION xy_players_sync_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_team xy_teams%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
      IF NEW.team_id IS NULL THEN
        NEW.team_number := NULL;
        RETURN NEW;
      END IF;
      SELECT * INTO v_team FROM xy_teams WHERE id = NEW.team_id;
      IF v_team.id IS NOT NULL THEN
        NEW.team_number := v_team.team_number;
      END IF;
      RETURN NEW;
    ELSIF NEW.team_number IS DISTINCT FROM OLD.team_number THEN
      IF NEW.team_number IS NULL THEN
        NEW.team_id := NULL;
        RETURN NEW;
      END IF;
      SELECT * INTO v_team
      FROM xy_teams
      WHERE session_id = NEW.session_id
        AND team_number = NEW.team_number;
      NEW.team_id := v_team.id;
      IF v_team.id IS NOT NULL THEN
        NEW.team_number := v_team.team_number;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    SELECT * INTO v_team FROM xy_teams WHERE id = NEW.team_id;
    IF v_team.id IS NOT NULL THEN
      NEW.team_number := v_team.team_number;
    END IF;
  ELSIF NEW.team_number IS NOT NULL THEN
    SELECT * INTO v_team
    FROM xy_teams
    WHERE session_id = NEW.session_id
      AND team_number = NEW.team_number;
    NEW.team_id := v_team.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xy_players_sync_team ON xy_players;
CREATE TRIGGER trg_xy_players_sync_team
  BEFORE INSERT OR UPDATE OF team_id, team_number ON xy_players
  FOR EACH ROW
  EXECUTE FUNCTION xy_players_sync_team();

-- Renaming / renumbering a team refreshes roster snapshots too.
CREATE OR REPLACE FUNCTION xy_teams_propagate_player_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE xy_players
  SET team_number = NEW.team_number
  WHERE team_id = NEW.id
    AND team_number IS DISTINCT FROM NEW.team_number;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xy_teams_propagate_player_identity ON xy_teams;
CREATE TRIGGER trg_xy_teams_propagate_player_identity
  AFTER UPDATE OF team_number ON xy_teams
  FOR EACH ROW
  EXECUTE FUNCTION xy_teams_propagate_player_identity();

UPDATE xy_players
SET full_name = real_name
WHERE btrim(COALESCE(full_name, '')) = ''
  AND btrim(COALESCE(real_name, '')) <> '';

UPDATE xy_players
SET real_name = full_name
WHERE btrim(COALESCE(real_name, '')) = ''
  AND btrim(COALESCE(full_name, '')) <> '';

-- Nameless leftovers would block the NOT NULL below; the join RPC rejects
-- blank names, so these can only be pre-existing junk rows.
UPDATE xy_players SET full_name = '' WHERE full_name IS NULL;

ALTER TABLE xy_players
  ALTER COLUMN full_name SET DEFAULT '',
  ALTER COLUMN full_name SET NOT NULL;

-- A legacy NOT NULL on real_name would break writers that only set full_name.
ALTER TABLE xy_players
  ALTER COLUMN real_name DROP NOT NULL,
  ALTER COLUMN real_name SET DEFAULT '';

/**
 * Keeps full_name and real_name equal no matter which one a writer sets.
 * On UPDATE the column that actually changed wins; on INSERT whichever column
 * carries a value is copied to the empty one.
 */
CREATE OR REPLACE FUNCTION xy_players_sync_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      NEW.real_name := NEW.full_name;
    ELSIF NEW.real_name IS DISTINCT FROM OLD.real_name THEN
      NEW.full_name := NEW.real_name;
    END IF;
  END IF;

  IF btrim(COALESCE(NEW.full_name, '')) = '' THEN
    NEW.full_name := COALESCE(NEW.real_name, '');
  ELSIF btrim(COALESCE(NEW.real_name, '')) = '' THEN
    NEW.real_name := NEW.full_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xy_players_sync_names ON xy_players;
CREATE TRIGGER trg_xy_players_sync_names
  BEFORE INSERT OR UPDATE ON xy_players
  FOR EACH ROW
  EXECUTE FUNCTION xy_players_sync_names();

CREATE INDEX IF NOT EXISTS idx_xy_players_team ON xy_players (team_id);

-- One phone vote per student per round.
CREATE TABLE IF NOT EXISTS xy_individual_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  round_number INT NOT NULL CHECK (round_number >= 1),
  player_id    UUID NOT NULL REFERENCES xy_players (id) ON DELETE CASCADE,
  vote         TEXT NOT NULL CHECK (vote IN ('X', 'Y')),
  -- `edited_by_mentor` flags the row; `edited_at` records when that happened
  -- and stays NULL for votes the student cast themselves.
  edited_by_mentor BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at    TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_individual_votes UNIQUE (session_id, round_number, player_id)
);

-- Upgrade path for databases created before these columns / constraints existed.
-- `player_id` stays UUID so the FK to xy_players (and its ON DELETE CASCADE)
-- survives; every client already treats the value as an opaque string.
ALTER TABLE xy_individual_votes
  ADD COLUMN IF NOT EXISTS player_id UUID,
  ADD COLUMN IF NOT EXISTS edited_by_mentor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ADD COLUMN IF NOT EXISTS skips a column that already exists as nullable, so
-- the flag is normalised separately: an unknown edit state means "not edited".
UPDATE xy_individual_votes SET edited_by_mentor = FALSE WHERE edited_by_mentor IS NULL;

ALTER TABLE xy_individual_votes
  ALTER COLUMN edited_by_mentor SET DEFAULT FALSE,
  ALTER COLUMN edited_by_mentor SET NOT NULL;

-- Rows flagged before edited_at existed get their best-known edit timestamp.
UPDATE xy_individual_votes
SET edited_at = COALESCE(updated_at, created_at, now())
WHERE edited_by_mentor
  AND edited_at IS NULL;

-- A vote with no voter cannot be attributed to a student, so it cannot be
-- analysed or exported — drop those before restoring the NOT NULL guarantee.
DELETE FROM xy_individual_votes WHERE player_id IS NULL;

DO $$
BEGIN
  ALTER TABLE xy_individual_votes ALTER COLUMN player_id SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xy_individual_votes_player_id_fkey'
  ) THEN
    ALTER TABLE xy_individual_votes
      ADD CONSTRAINT xy_individual_votes_player_id_fkey
      FOREIGN KEY (player_id) REFERENCES xy_players (id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_xy_individual_votes'
  ) THEN
    ALTER TABLE xy_individual_votes
      ADD CONSTRAINT uq_xy_individual_votes UNIQUE (session_id, round_number, player_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_xy_individual_votes_round
  ON xy_individual_votes (session_id, round_number);

CREATE INDEX IF NOT EXISTS idx_xy_individual_votes_player
  ON xy_individual_votes (player_id);

-- One paper decision per team per round (mentor entered).
--
-- `team_id` stays the identity of the row (FK + cascade + upsert key), while
-- `team_number` / `team_name` are snapshots of the team at scoring time so
-- exports and offline tooling can read a round without joining xy_teams.
-- `points_awarded` mirrors `points`; triggers below keep every pair in step.
CREATE TABLE IF NOT EXISTS xy_team_votes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES xy_sessions (id) ON DELETE CASCADE,
  round_number   INT NOT NULL CHECK (round_number >= 1),
  team_id        UUID NOT NULL REFERENCES xy_teams (id) ON DELETE CASCADE,
  team_number    INT,
  team_name      TEXT,
  vote           TEXT NOT NULL CHECK (vote IN ('X', 'Y')),
  -- Both spellings of the score; the sync trigger keeps them equal.
  points         INT NOT NULL DEFAULT 0,
  points_awarded INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_xy_team_votes UNIQUE (session_id, round_number, team_id),
  CONSTRAINT unq_xy_team_votes_round UNIQUE (session_id, round_number, team_number)
);

-- Upgrade path for a table that carries only one side of each pair.
ALTER TABLE xy_team_votes
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS team_number INT,
  ADD COLUMN IF NOT EXISTS team_name TEXT,
  ADD COLUMN IF NOT EXISTS points INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_awarded INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Rows written by team number get their FK resolved…
UPDATE xy_team_votes v
SET team_id = t.id
FROM xy_teams t
WHERE v.team_id IS NULL
  AND t.session_id = v.session_id
  AND t.team_number = v.team_number;

-- …and rows written by team id get their snapshot filled in.
UPDATE xy_team_votes v
SET team_number = t.team_number,
    team_name = t.name
FROM xy_teams t
WHERE v.team_id = t.id
  AND (v.team_number IS DISTINCT FROM t.team_number OR v.team_name IS DISTINCT FROM t.name);

-- Prefer the non-zero side when only one spelling was populated, then force
-- both columns to a concrete integer so DEFAULT 0 / NOT NULL can stick.
UPDATE xy_team_votes
SET points = points_awarded
WHERE points_awarded IS NOT NULL
  AND COALESCE(points, 0) = 0
  AND points_awarded <> 0;

UPDATE xy_team_votes
SET points = 0
WHERE points IS NULL;

UPDATE xy_team_votes
SET points_awarded = points
WHERE points_awarded IS NULL
   OR points_awarded IS DISTINCT FROM points;

ALTER TABLE xy_team_votes
  ALTER COLUMN points SET DEFAULT 0,
  ALTER COLUMN points SET NOT NULL,
  ALTER COLUMN points_awarded SET DEFAULT 0,
  ALTER COLUMN points_awarded SET NOT NULL;

-- Mentor-entered scores are never deleted to satisfy a constraint: the FK is
-- only tightened once every row actually resolves to a team. Unique keys are
-- re-asserted the same way so a database that predates them picks them up.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM xy_team_votes WHERE team_id IS NULL) THEN
    ALTER TABLE xy_team_votes ALTER COLUMN team_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xy_team_votes_team_id_fkey'
  ) THEN
    ALTER TABLE xy_team_votes
      ADD CONSTRAINT xy_team_votes_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES xy_teams (id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_xy_team_votes'
  ) AND NOT EXISTS (
    SELECT 1
    FROM xy_team_votes
    WHERE team_id IS NOT NULL
    GROUP BY session_id, round_number, team_id
    HAVING COUNT(*) > 1
  ) THEN
    ALTER TABLE xy_team_votes
      ADD CONSTRAINT uq_xy_team_votes UNIQUE (session_id, round_number, team_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unq_xy_team_votes_round'
  ) AND NOT EXISTS (
    SELECT 1
    FROM xy_team_votes
    WHERE team_number IS NOT NULL
    GROUP BY session_id, round_number, team_number
    HAVING COUNT(*) > 1
  ) THEN
    ALTER TABLE xy_team_votes
      ADD CONSTRAINT unq_xy_team_votes_round
      UNIQUE (session_id, round_number, team_number);
  END IF;
END;
$$;

/**
 * Accepts a team vote written either way: given a team number it resolves the
 * FK, given a team id it refreshes the name/number snapshot, and it keeps
 * points and points_awarded equal.
 */
CREATE OR REPLACE FUNCTION xy_team_votes_sync_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_team xy_teams%ROWTYPE;
BEGIN
  IF NEW.team_id IS NULL AND NEW.team_number IS NOT NULL THEN
    SELECT * INTO v_team
    FROM xy_teams
    WHERE session_id = NEW.session_id
      AND team_number = NEW.team_number;

    NEW.team_id := v_team.id;
  ELSIF NEW.team_id IS NOT NULL THEN
    SELECT * INTO v_team FROM xy_teams WHERE id = NEW.team_id;
  END IF;

  IF v_team.id IS NOT NULL THEN
    NEW.team_number := v_team.team_number;
    NEW.team_name := v_team.name;
  END IF;

  -- Keep points and points_awarded equal: the column that actually changed
  -- wins on UPDATE; on INSERT either spelling fills the other, defaulting to 0.
  IF TG_OP = 'UPDATE' AND NEW.points IS DISTINCT FROM OLD.points THEN
    NEW.points_awarded := COALESCE(NEW.points, 0);
    NEW.points := COALESCE(NEW.points, 0);
  ELSIF TG_OP = 'UPDATE' AND NEW.points_awarded IS DISTINCT FROM OLD.points_awarded THEN
    NEW.points := COALESCE(NEW.points_awarded, 0);
    NEW.points_awarded := COALESCE(NEW.points_awarded, 0);
  ELSE
    NEW.points := COALESCE(NEW.points, NEW.points_awarded, 0);
    NEW.points_awarded := NEW.points;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xy_team_votes_sync_team ON xy_team_votes;
CREATE TRIGGER trg_xy_team_votes_sync_team
  BEFORE INSERT OR UPDATE ON xy_team_votes
  FOR EACH ROW
  EXECUTE FUNCTION xy_team_votes_sync_team();

/** Renaming or renumbering a team refreshes the snapshots it already left. */
CREATE OR REPLACE FUNCTION xy_teams_propagate_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE xy_team_votes
  SET team_number = NEW.team_number,
      team_name = NEW.name
  WHERE team_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xy_teams_propagate_identity ON xy_teams;
CREATE TRIGGER trg_xy_teams_propagate_identity
  AFTER UPDATE OF name, team_number ON xy_teams
  FOR EACH ROW
  EXECUTE FUNCTION xy_teams_propagate_identity();

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

-- xy_team_votes deliberately keeps only the public SELECT policy created above:
-- the paper decisions are the scoreboard itself, so writes stay with the
-- mentor's service-role client rather than anyone holding the anon key.

-- Teams are roster scaffolding rather than game results: the mentor panel and
-- any offline tooling may create, rename and re-colour them without auth.
DROP POLICY IF EXISTS xy_teams_full_access ON xy_teams;
CREATE POLICY xy_teams_full_access
  ON xy_teams FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

/**
 * Student joins the active XY session with their real name.
 * Idempotent per (session_id, player_uid) — refreshes the name on re-join.
 *
 * Accepts either name spelling (or both). Named-arg callers may pass only
 * `p_full_name` or only `p_real_name`; positional 3-arg calls still bind
 * `p_full_name` and leave `p_real_name` at its default.
 */
DROP FUNCTION IF EXISTS xy_join_player(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS xy_join_player(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION xy_join_player(
  p_session_id UUID,
  p_player_uid TEXT,
  p_full_name  TEXT DEFAULT NULL,
  p_real_name  TEXT DEFAULT NULL
)
RETURNS xy_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    TEXT := btrim(COALESCE(p_player_uid, ''));
  -- Prefer real_name (same order as resolveXyPlayerName), then full_name.
  v_name   TEXT := COALESCE(
    NULLIF(btrim(COALESCE(p_real_name, '')), ''),
    NULLIF(btrim(COALESCE(p_full_name, '')), ''),
    ''
  );
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

  INSERT INTO xy_players (session_id, player_uid, full_name, real_name)
  VALUES (p_session_id, v_uid, v_name, v_name)
  ON CONFLICT (session_id, player_uid)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    real_name = EXCLUDED.full_name
  RETURNING * INTO v_player;

  RETURN v_player;
END;
$$;

COMMENT ON FUNCTION xy_join_player(UUID, TEXT, TEXT, TEXT) IS
  'Idempotent XY-game roster join keyed by (session_id, player_uid). Accepts p_full_name and/or p_real_name.';

GRANT EXECUTE ON FUNCTION xy_join_player(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

/**
 * Student casts (or changes) their phone vote for the session's OPEN round.
 * Rejects writes while the mentor has voting closed.
 *
 * Primary signature: (p_session_id, p_player_uid, p_vote, p_round_number).
 * `p_round_number` is optional — when omitted the session's current_round is
 * used; when supplied it must match the open round.
 *
 * Overload: (p_player_uid, p_session_id, p_vote) for callers that bind the
 * device uid first (distinct argument types: TEXT, UUID, TEXT).
 */
DROP FUNCTION IF EXISTS xy_cast_individual_vote(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS xy_cast_individual_vote(UUID, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS xy_cast_individual_vote(TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION xy_cast_individual_vote(
  p_session_id   UUID,
  p_player_uid   TEXT,
  p_vote         TEXT,
  p_round_number INT DEFAULT NULL
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
  v_round     INT;
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

  v_round := COALESCE(p_round_number, v_session.current_round);

  IF v_round <> v_session.current_round THEN
    RAISE EXCEPTION
      'XY_ROUND_MISMATCH: expected round %, got %',
      v_session.current_round,
      v_round
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
  VALUES (p_session_id, v_round, v_player_id, v_vote)
  ON CONFLICT (session_id, round_number, player_id)
  DO UPDATE SET
    vote = EXCLUDED.vote,
    -- The student overwrote whatever the mentor had entered, so the row is
    -- no longer a mentor edit.
    edited_by_mentor = FALSE,
    edited_at = NULL,
    updated_at = now();

  RETURN jsonb_build_object(
    'round_number', v_round,
    'player_id', v_player_id,
    'vote', v_vote
  );
END;
$$;

COMMENT ON FUNCTION xy_cast_individual_vote(UUID, TEXT, TEXT, INT) IS
  'Upserts a student phone vote (X/Y) for the currently open XY round. Optional p_round_number must match current_round.';

GRANT EXECUTE ON FUNCTION xy_cast_individual_vote(UUID, TEXT, TEXT, INT) TO anon, authenticated;

/**
 * Compatibility overload: device uid first, then session id.
 * Delegates to the primary signature so both call shapes share one body.
 */
CREATE OR REPLACE FUNCTION xy_cast_individual_vote(
  p_player_uid TEXT,
  p_session_id UUID,
  p_vote       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN xy_cast_individual_vote(p_session_id, p_player_uid, p_vote, NULL);
END;
$$;

COMMENT ON FUNCTION xy_cast_individual_vote(TEXT, UUID, TEXT) IS
  'Compatibility overload of xy_cast_individual_vote with (p_player_uid, p_session_id, p_vote) argument order.';

GRANT EXECUTE ON FUNCTION xy_cast_individual_vote(TEXT, UUID, TEXT) TO anon, authenticated;
