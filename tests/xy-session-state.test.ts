import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  fetchActiveXySession,
  fetchXySnapshot,
  normalizeXyIndividualVoteRow,
  normalizeXySessionRow,
  normalizeXyTeamVoteRow,
} from "@/lib/supabase/xy-client";
import {
  XY_UNKNOWN_PLAYER_NAME,
  resolveXyPlayerName,
} from "@/lib/xy/roster";
import {
  XY_DEFAULT_SESSION_LABEL,
  XY_SESSION_LABEL_MAX,
  XY_STATUS_ACTIVE,
  XY_STATUS_COMPLETED,
  isXySessionLive,
  parseXySessionStatus,
  resolveXySessionLabel,
  xySessionEndPatch,
  xySessionStartPatch,
} from "@/lib/xy/session-state";
import type { XYSession } from "@/types/xy";

const REPO_ROOT = path.resolve(__dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function makeSession(overrides: Partial<XYSession> = {}): XYSession {
  return {
    id: "xy-session-1",
    label: "XY თამაში",
    is_active: true,
    status: "active",
    current_round: 1,
    voting_open: false,
    created_at: "2026-07-31T09:00:00.000Z",
    ended_at: null,
    ...overrides,
  };
}

describe("isXySessionLive", () => {
  it("requires both is_active and status = active", () => {
    expect(isXySessionLive(makeSession())).toBe(true);
  });

  it("rejects a session that is flagged inactive", () => {
    expect(isXySessionLive(makeSession({ is_active: false, status: "completed" }))).toBe(
      false
    );
  });

  it("rejects drifted rows where only one flag says live", () => {
    expect(isXySessionLive(makeSession({ status: "completed" }))).toBe(false);
    expect(isXySessionLive(makeSession({ is_active: false }))).toBe(false);
  });

  it("treats a missing session as not live", () => {
    expect(isXySessionLive(null)).toBe(false);
    expect(isXySessionLive(undefined)).toBe(false);
  });
});

describe("session lifecycle patches", () => {
  it("starts a session with both flags live", () => {
    const patch = xySessionStartPatch();
    expect(patch).toEqual({ is_active: true, status: XY_STATUS_ACTIVE, ended_at: null });
    expect(isXySessionLive({ ...makeSession(), ...patch })).toBe(true);
  });

  it("retires a session by moving both flags together", () => {
    const patch = xySessionEndPatch(new Date("2026-07-31T18:30:00.000Z"));
    expect(patch).toEqual({
      is_active: false,
      status: XY_STATUS_COMPLETED,
      ended_at: "2026-07-31T18:30:00.000Z",
    });
    expect(isXySessionLive({ ...makeSession(), ...patch })).toBe(false);
  });
});

describe("resolveXySessionLabel", () => {
  it("keeps a mentor-provided name, trimmed", () => {
    expect(resolveXySessionLabel("  XY თამაში — დღე 3  ")).toBe("XY თამაში — დღე 3");
  });

  it("falls back to the column default for blank input", () => {
    expect(resolveXySessionLabel("")).toBe(XY_DEFAULT_SESSION_LABEL);
    expect(resolveXySessionLabel("   ")).toBe(XY_DEFAULT_SESSION_LABEL);
    expect(resolveXySessionLabel(null)).toBe(XY_DEFAULT_SESSION_LABEL);
    expect(resolveXySessionLabel(undefined)).toBe(XY_DEFAULT_SESSION_LABEL);
  });

  it("caps overly long names", () => {
    const long = "ა".repeat(XY_SESSION_LABEL_MAX + 25);
    expect(resolveXySessionLabel(long)).toHaveLength(XY_SESSION_LABEL_MAX);
  });

  it("matches the SQL default exactly", () => {
    expect(XY_DEFAULT_SESSION_LABEL).toBe("XY თამაში");
  });
});

describe("parseXySessionStatus", () => {
  it("accepts only the two known states", () => {
    expect(parseXySessionStatus("active")).toBe("active");
    expect(parseXySessionStatus("completed")).toBe("completed");
    expect(parseXySessionStatus("paused")).toBeNull();
    expect(parseXySessionStatus(null)).toBeNull();
  });
});

describe("normalizeXySessionRow", () => {
  it("derives status for a database created before the column existed", () => {
    const legacy = {
      id: "xy-1",
      label: "XY თამაში",
      is_active: true,
      current_round: 2,
      voting_open: true,
      created_at: "2026-07-31T09:00:00.000Z",
      ended_at: null,
    };

    expect(normalizeXySessionRow(legacy)).toMatchObject({
      id: "xy-1",
      is_active: true,
      status: "active",
      current_round: 2,
      voting_open: true,
    });
  });

  it("derives is_active from status when only status is present", () => {
    expect(normalizeXySessionRow({ id: "xy-1", status: "active" })).toMatchObject({
      is_active: true,
      status: "active",
    });
    expect(normalizeXySessionRow({ id: "xy-1", status: "completed" })).toMatchObject({
      is_active: false,
      status: "completed",
    });
  });

  it("keeps a drifted pair intact so the liveness check can reject it", () => {
    const drifted = normalizeXySessionRow({
      id: "xy-1",
      is_active: true,
      status: "completed",
    });

    expect(drifted).toMatchObject({ is_active: true, status: "completed" });
    expect(isXySessionLive(drifted)).toBe(false);
  });

  it("falls back to safe defaults for missing fields", () => {
    expect(normalizeXySessionRow({ id: "xy-1" })).toEqual({
      id: "xy-1",
      label: XY_DEFAULT_SESSION_LABEL,
      is_active: true,
      status: "active",
      current_round: 1,
      voting_open: false,
      created_at: "",
      ended_at: null,
    });
  });

  it("rejects rows without an id", () => {
    expect(normalizeXySessionRow(null)).toBeNull();
    expect(normalizeXySessionRow({})).toBeNull();
    expect(normalizeXySessionRow({ id: "" })).toBeNull();
    expect(normalizeXySessionRow("nope")).toBeNull();
  });
});

describe("fetchActiveXySession", () => {
  type QueryOutcome = {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  /** Each call to `.from()` consumes the next queued outcome. */
  function buildSupabaseStub(outcomes: QueryOutcome[]) {
    const filters: [string, unknown][] = [];
    const orders: unknown[] = [];
    const limits: unknown[] = [];
    let call = 0;

    const supabase = {
      from: vi.fn(() => {
        const outcome = outcomes[call] ?? { data: null, error: null };
        call += 1;

        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push([column, value]);
            return builder;
          }),
          order: vi.fn((column: string, opts: unknown) => {
            orders.push([column, opts]);
            return builder;
          }),
          limit: vi.fn((n: unknown) => {
            limits.push(n);
            return builder;
          }),
          maybeSingle: vi.fn(async () => outcome),
        };

        return builder;
      }),
    };

    return { supabase, filters, orders, limits, callCount: () => call };
  }

  function run(supabase: unknown) {
    return fetchActiveXySession(
      supabase as Parameters<typeof fetchActiveXySession>[0]
    );
  }

  it("finds the newest is_active session without a second query", async () => {
    const row = makeSession();
    const { supabase, filters, orders, limits, callCount } = buildSupabaseStub([
      { data: row, error: null },
    ]);

    await expect(run(supabase)).resolves.toEqual(row);
    expect(filters).toEqual([["is_active", true]]);
    expect(orders).toEqual([["created_at", { ascending: false }]]);
    expect(limits).toEqual([1]);
    expect(callCount()).toBe(1);
  });

  it("falls back to status = active when is_active matches nothing", async () => {
    const row = makeSession();
    const { supabase, filters, callCount } = buildSupabaseStub([
      { data: null, error: null },
      { data: row, error: null },
    ]);

    await expect(run(supabase)).resolves.toEqual(row);
    expect(filters).toEqual([
      ["is_active", true],
      ["status", "active"],
    ]);
    expect(callCount()).toBe(2);
  });

  it("tolerates a database where one of the columns does not exist yet", async () => {
    const legacyRow = {
      id: "xy-legacy",
      label: "XY თამაში",
      is_active: true,
      current_round: 1,
      voting_open: false,
      created_at: "2026-07-31T09:00:00.000Z",
      ended_at: null,
    };

    const { supabase } = buildSupabaseStub([
      { data: legacyRow, error: null },
      { data: null, error: { message: "column does not exist", code: "42703" } },
    ]);

    await expect(run(supabase)).resolves.toMatchObject({
      id: "xy-legacy",
      status: "active",
    });

    // And the mirror case: no is_active column, session found via status.
    const { supabase: statusOnly, callCount } = buildSupabaseStub([
      { data: null, error: { message: "column does not exist", code: "42703" } },
      { data: { id: "xy-status", status: "active" }, error: null },
    ]);

    await expect(run(statusOnly)).resolves.toMatchObject({ id: "xy-status" });
    expect(callCount()).toBe(2);
  });

  it("returns null when neither lookup finds a live session", async () => {
    const { supabase, callCount } = buildSupabaseStub([
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await expect(run(supabase)).resolves.toBeNull();
    expect(callCount()).toBe(2);
  });

  it("discards a drifted row from both lookups", async () => {
    const drifted = makeSession({ status: "completed" });
    const { supabase } = buildSupabaseStub([
      { data: drifted, error: null },
      { data: drifted, error: null },
    ]);

    await expect(run(supabase)).resolves.toBeNull();
  });

  it("surfaces real query errors instead of hiding them", async () => {
    const { supabase } = buildSupabaseStub([
      { data: null, error: { message: "boom", code: "42P01" } },
    ]);

    await expect(run(supabase)).rejects.toThrow("boom");
  });
});

describe("xy_sessions schema and action guards", () => {
  const migration = readSource("supabase/migrations/010_xy_win_win_game.sql");
  const actions = readSource("src/lib/actions/xy-actions.ts");

  it("declares label, is_active, status and ended_at with explicit defaults", () => {
    expect(migration).toMatch(
      new RegExp(`label\\s+TEXT NOT NULL DEFAULT '${XY_DEFAULT_SESSION_LABEL}'`)
    );
    expect(migration).toMatch(/is_active\s+BOOLEAN NOT NULL DEFAULT TRUE/);
    expect(migration).toMatch(/status\s+TEXT NOT NULL DEFAULT 'active'/);
    expect(migration).toMatch(/ended_at\s+TIMESTAMPTZ DEFAULT NULL/);
  });

  it("constrains status values and keeps them in lockstep with is_active", () => {
    expect(migration).toContain("xy_sessions_status_allowed");
    expect(migration).toContain("xy_sessions_status_matches_is_active");
    expect(migration).toMatch(
      /\(is_active AND status = 'active'\) OR \(NOT is_active AND status = 'completed'\)/
    );
  });

  it("ships an idempotent upgrade path for existing databases", () => {
    expect(migration).toMatch(
      new RegExp(
        `ADD COLUMN IF NOT EXISTS label TEXT DEFAULT '${XY_DEFAULT_SESSION_LABEL}'`
      )
    );
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'/
    );
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ DEFAULT NULL/
    );
    expect(migration).toContain("FROM pg_constraint WHERE conname =");
  });

  it("keeps label non-null and non-blank on existing databases", () => {
    expect(migration).toMatch(/WHERE label IS NULL\s*\n\s*OR btrim\(label\) = ''/);
    expect(migration).toMatch(/ALTER COLUMN label SET DEFAULT 'XY თამაში'/);
    expect(migration).toMatch(/ALTER COLUMN label SET NOT NULL/);
  });

  it("resolves and inserts label explicitly", () => {
    expect(actions).toContain("resolveXySessionLabel(label)");
    expect(actions).toContain("label: resolvedLabel");
  });

  it("creates the session with every lifecycle field spelled out", () => {
    const insertBlock = actions.slice(
      actions.indexOf('.from("xy_sessions")\n      .insert({'),
      actions.indexOf('.select("*")')
    );

    for (const field of [
      "label: resolvedLabel",
      "is_active: true",
      "status: XY_STATUS_ACTIVE",
      "current_round: 1",
      "voting_open: false",
      "ended_at: null",
    ]) {
      expect(insertBlock).toContain(field);
    }
  });

  it("runs every mentor mutation through the service-role client", () => {
    expect(actions).toContain("function getSupabaseServerAdminClient()");
    expect(actions).toContain("return createAdminSupabaseClient();");

    // One import + one call inside the helper: no action builds its own client.
    expect(actions.match(/createAdminSupabaseClient/g)).toHaveLength(2);

    // Every client an action gets hold of is the service-role one.
    for (const match of actions.matchAll(/const supabase = (\w+)\(\)/g)) {
      expect(match[1]).toBe("getSupabaseServerAdminClient");
    }
    expect(actions).toContain("fetchXySnapshot(getSupabaseServerAdminClient())");
  });

  it("rolls the session back when the 8 default teams cannot be created", () => {
    expect(actions).toContain('.from("xy_teams")');
    expect(actions).toContain("createdTeams !== XY_DEFAULT_TEAMS.length");
    expect(actions).toMatch(
      /await supabase\.from\("xy_sessions"\)\.delete\(\)\.eq\("id", session\.id\)/
    );
    expect(actions).toContain("გუნდები ვერ შეიქმნა:");
  });

  it("reports failures as { success: false, error }", () => {
    expect(actions).toContain("| { success: true; data: T }");
    expect(actions).toContain("| { success: false; error: string }");
    expect(actions).not.toMatch(/\bok: (true|false)\b/);
  });

  it("backfills a close timestamp for already retired sessions", () => {
    expect(migration).toMatch(
      /SET ended_at = COALESCE\(ended_at, now\(\)\)\s*\n\s*WHERE is_active = FALSE\s*\n\s*AND ended_at IS NULL/
    );
  });

  it("indexes the canonical live-session lookup", () => {
    expect(migration).toMatch(
      /ON xy_sessions \(is_active, status, created_at DESC\)\s*\n\s*WHERE is_active = TRUE AND status = 'active'/
    );
  });

  it("guards both RPCs against non-live sessions", () => {
    const guards = migration.match(/AND is_active = TRUE\s*\n\s*AND status = 'active'/g);
    expect(guards?.length).toBe(2);
    expect(migration).toContain("XY_SESSION_NOT_ACTIVE");
  });

  it("filters session mutations on is_active and status", () => {
    const activeStatusFilters = actions.match(
      /\.eq\("is_active", true\)\s*\n\s*\.eq\("status", XY_STATUS_ACTIVE\)/g
    );
    // createXySession (deactivate), setXyRoundState, endXySession.
    expect(activeStatusFilters?.length).toBe(3);
  });

  it("never flips is_active without setting status alongside it", () => {
    for (const match of actions.matchAll(/is_active:\s*(true|false)/g)) {
      const start = Math.max(0, (match.index ?? 0) - 200);
      const nearby = actions.slice(start, (match.index ?? 0) + 200);
      expect(nearby).toMatch(/status:/);
    }

    // Closing a session always goes through the shared patch.
    expect(actions).toContain("xySessionEndPatch()");
  });

  it("creates sessions with the same flags xySessionStartPatch() defines", () => {
    const patch = xySessionStartPatch();
    expect(patch).toMatchObject({ is_active: true, status: "active" });

    expect(actions).toContain("is_active: true");
    expect(actions).toContain("status: XY_STATUS_ACTIVE");
  });
});

describe("xy_teams migration is idempotent", () => {
  const migration = readSource("supabase/migrations/010_xy_win_win_game.sql");

  it("creates the table with every column the app reads", () => {
    const createBlock = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS xy_teams"),
      migration.indexOf("-- Upgrade path for databases created before these columns")
    );

    expect(createBlock).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(createBlock).toMatch(
      /session_id\s+UUID NOT NULL REFERENCES xy_sessions \(id\) ON DELETE CASCADE/
    );
    expect(createBlock).toMatch(/team_number\s+INT NOT NULL CHECK \(team_number BETWEEN 1 AND 8\)/);
    expect(createBlock).toMatch(/name\s+TEXT NOT NULL DEFAULT/);
    expect(createBlock).toMatch(/color\s+TEXT NOT NULL DEFAULT '#2563EB'/);
    expect(createBlock).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    expect(createBlock).toContain(
      "CONSTRAINT uq_xy_teams_session_number UNIQUE (session_id, team_number)"
    );
  });

  it("re-runs safely against a table that predates these columns", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#2563EB'/);
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/
    );
    expect(migration).toContain(
      "SELECT 1 FROM pg_constraint WHERE conname = 'uq_xy_teams_session_number'"
    );
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_xy_teams_session");
  });

  it("enables RLS with a public full-access policy", () => {
    expect(migration).toContain("ALTER TABLE xy_teams ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("DROP POLICY IF EXISTS xy_teams_full_access ON xy_teams");
    expect(migration).toMatch(
      /CREATE POLICY xy_teams_full_access\s*\n\s*ON xy_teams FOR ALL\s*\n\s*TO anon, authenticated\s*\n\s*USING \(true\)\s*\n\s*WITH CHECK \(true\)/
    );
  });

  it("registers the table for realtime exactly once", () => {
    expect(migration).toContain("ALTER TABLE xy_teams REPLICA IDENTITY FULL");
    expect(migration).toMatch(
      /ALTER PUBLICATION supabase_realtime ADD TABLE %I[\s\S]*?WHEN duplicate_object THEN NULL/
    );

    const publicationLoop = migration.slice(
      migration.indexOf("ALTER TABLE xy_sessions REPLICA IDENTITY FULL")
    );
    expect(publicationLoop).toContain("'xy_sessions', 'xy_teams', 'xy_players'");
  });
});

describe("xy_players name columns", () => {
  const migration = readSource("supabase/migrations/010_xy_win_win_game.sql");
  const client = readSource("src/lib/supabase/xy-client.ts");

  it("declares both full_name and real_name", () => {
    const createBlock = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS xy_players"),
      migration.indexOf("-- Upgrade path for databases that only have one")
    );

    expect(createBlock).toMatch(/full_name\s+TEXT NOT NULL/);
    expect(createBlock).toMatch(/real_name\s+TEXT/);
  });

  it("adds either missing column and backfills it from the other", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS full_name TEXT");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS real_name TEXT");

    expect(migration).toMatch(
      /UPDATE xy_players\s*\nSET full_name = real_name\s*\nWHERE btrim\(COALESCE\(full_name, ''\)\) = ''/
    );
    expect(migration).toMatch(
      /UPDATE xy_players\s*\nSET real_name = full_name\s*\nWHERE btrim\(COALESCE\(real_name, ''\)\) = ''/
    );

    // A legacy NOT NULL on real_name would reject full_name-only writers.
    expect(migration).toMatch(/ALTER COLUMN real_name DROP NOT NULL/);
    expect(migration).toMatch(/ALTER COLUMN full_name SET NOT NULL/);
  });

  it("keeps the two columns in lockstep for every writer", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION xy_players_sync_names()");
    expect(migration).toMatch(
      /CREATE TRIGGER trg_xy_players_sync_names\s*\n\s*BEFORE INSERT OR UPDATE ON xy_players/
    );
    expect(migration).toContain(
      "INSERT INTO xy_players (session_id, player_uid, full_name, real_name)"
    );
    expect(migration).toMatch(/real_name = EXCLUDED\.full_name/);
  });

  it("selects both columns and tolerates a table missing one of them", () => {
    expect(client).toContain(
      'XY_PLAYER_COLUMNS =\n  "id, session_id, player_uid, full_name, real_name, team_id, created_at"'
    );
    expect(client).toContain("() => query(XY_PLAYER_COLUMNS)");
    expect(client).toContain("primary.error?.code === UNDEFINED_COLUMN");
  });
});

describe("xy_team_votes schema and reads", () => {
  const migration = readSource("supabase/migrations/010_xy_win_win_game.sql");
  const client = readSource("src/lib/supabase/xy-client.ts");

  it("declares the identity column and both mirrored pairs", () => {
    const createStart = migration.indexOf("CREATE TABLE IF NOT EXISTS xy_team_votes");
    const createBlock = migration.slice(
      createStart,
      migration.indexOf("-- Upgrade path for a table that carries only one side", createStart)
    );

    expect(createStart).toBeGreaterThan(-1);
    for (const column of [
      /id\s+UUID PRIMARY KEY/,
      /session_id\s+UUID NOT NULL REFERENCES xy_sessions/,
      /round_number\s+INT NOT NULL/,
      /team_id\s+UUID NOT NULL REFERENCES xy_teams \(id\) ON DELETE CASCADE/,
      /team_number\s+INT/,
      /team_name\s+TEXT/,
      /vote\s+TEXT NOT NULL CHECK/,
      /points\s+INT NOT NULL DEFAULT 0/,
      /points_awarded INT DEFAULT NULL/,
      /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/,
      /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/,
    ]) {
      expect(createBlock).toMatch(column);
    }

    expect(createBlock).toContain(
      "CONSTRAINT uq_xy_team_votes UNIQUE (session_id, round_number, team_id)"
    );
  });

  it("re-runs safely and resolves either write shape", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS team_number INT");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS team_name TEXT");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS points_awarded INT DEFAULT NULL");

    // A row written by team number gets its FK filled in, and vice versa.
    expect(migration).toMatch(/SET team_id = t\.id[\s\S]*?WHERE v\.team_id IS NULL/);
    expect(migration).toMatch(/SET team_number = t\.team_number,\s*\n\s*team_name = t\.name/);
    expect(migration).toContain("CREATE OR REPLACE FUNCTION xy_team_votes_sync_team()");
    expect(migration).toMatch(
      /CREATE TRIGGER trg_xy_team_votes_sync_team\s*\n\s*BEFORE INSERT OR UPDATE ON xy_team_votes/
    );
  });

  it("keeps mentor scores instead of deleting them to satisfy the FK", () => {
    expect(migration).not.toMatch(/DELETE FROM xy_team_votes/);
    expect(migration).toContain(
      "IF NOT EXISTS (SELECT 1 FROM xy_team_votes WHERE team_id IS NULL) THEN"
    );
    expect(migration).toContain(
      "SELECT 1 FROM pg_constraint WHERE conname = 'xy_team_votes_team_id_fkey'"
    );
  });

  it("refreshes the snapshots when a team is renamed", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION xy_teams_propagate_identity()"
    );
    expect(migration).toMatch(
      /CREATE TRIGGER trg_xy_teams_propagate_identity\s*\n\s*AFTER UPDATE OF name, team_number ON xy_teams/
    );
  });

  it("has RLS with a public read policy and realtime registration", () => {
    expect(migration).toContain("ALTER TABLE xy_team_votes ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE xy_team_votes REPLICA IDENTITY FULL");

    const policyLoop = migration.slice(
      migration.indexOf("DROP POLICY IF EXISTS %I ON %I") - 400
    );
    expect(policyLoop).toContain("v_table || '_select_all'");

    const tableLists = migration.match(
      /'xy_sessions', 'xy_teams', 'xy_players', 'xy_individual_votes', 'xy_team_votes'/g
    );
    // Once for the realtime publication, once for the RLS policy loop.
    expect(tableLists).toHaveLength(2);
  });

  it("selects both spellings and retries with a wildcard", () => {
    expect(client).toContain(
      'XY_TEAM_VOTE_COLUMNS =\n  "id, session_id, round_number, team_id, team_number, team_name, vote, points, points_awarded"'
    );
    expect(client).toContain("() => query(XY_TEAM_VOTE_COLUMNS)");
  });
});

describe("fetchXySnapshot degradation", () => {
  type TableOutcome = {
    data?: unknown[];
    error?: { message: string; code?: string };
  };

  function buildSnapshotStub(outcomes: Record<string, TableOutcome>) {
    const supabase = {
      from: (table: string) => {
        const outcome = outcomes[table] ?? {};
        const result = { data: outcome.data ?? [], error: outcome.error ?? null };

        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => ({
            data: (outcome.data ?? [])[0] ?? null,
            error: outcome.error ?? null,
          }),
          // List queries are awaited on the builder itself.
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
        };

        return builder;
      },
    };

    return supabase as unknown as Parameters<typeof fetchXySnapshot>[0];
  }

  const session = makeSession();

  it("keeps the panel alive when the paper votes cannot be read", async () => {
    const snapshot = await fetchXySnapshot(
      buildSnapshotStub({
        xy_sessions: { data: [session] },
        xy_teams: { data: [] },
        xy_players: { data: [] },
        xy_individual_votes: { data: [] },
        xy_team_votes: {
          error: { message: 'relation "xy_team_votes" does not exist', code: "42P01" },
        },
      })
    );

    expect(snapshot.session).toMatchObject({ id: session.id });
    expect(snapshot.teamVotes).toEqual([]);
    expect(snapshot.warnings).toHaveLength(1);
    expect(snapshot.warnings[0]).toContain("xy_team_votes");
  });

  it("still fails loudly when the roster cannot be read", async () => {
    await expect(
      fetchXySnapshot(
        buildSnapshotStub({
          xy_sessions: { data: [session] },
          xy_teams: { data: [] },
          xy_players: { error: { message: "roster is gone", code: "42P01" } },
          xy_individual_votes: { data: [] },
          xy_team_votes: { data: [] },
        })
      )
    ).rejects.toThrow("roster is gone");
  });

  it("reports no warnings on a healthy read", async () => {
    const snapshot = await fetchXySnapshot(
      buildSnapshotStub({
        xy_sessions: { data: [session] },
        xy_teams: { data: [] },
        xy_players: { data: [] },
        xy_individual_votes: { data: [] },
        xy_team_votes: {
          data: [
            {
              id: "tv-1",
              session_id: session.id,
              round_number: 1,
              team_id: "team-1",
              vote: "Y",
              points: 10,
            },
          ],
        },
      })
    );

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.teamVotes[0]).toMatchObject({ points: 10, points_awarded: 10 });
  });
});

describe("normalizeXyTeamVoteRow", () => {
  const row = {
    id: "tv-1",
    session_id: "session-1",
    round_number: 3,
    team_id: "team-1",
    vote: "Y",
    points: -20,
  };

  it("mirrors points into points_awarded", () => {
    expect(normalizeXyTeamVoteRow(row)).toEqual({
      ...row,
      team_number: null,
      team_name: null,
      points_awarded: -20,
    });
  });

  it("scores a row that only carries points_awarded", () => {
    const legacy = normalizeXyTeamVoteRow({
      id: "tv-2",
      session_id: "session-1",
      round_number: 3,
      team_id: "team-2",
      team_number: 2,
      team_name: "მწვანეები",
      vote: "X",
      points_awarded: 10,
    });

    expect(legacy.points).toBe(10);
    expect(legacy.team_name).toBe("მწვანეები");
  });

  it("defaults to zero points rather than NaN", () => {
    expect(normalizeXyTeamVoteRow({ id: "tv-3" }).points).toBe(0);
  });
});

describe("xy_individual_votes mentor-edit audit columns", () => {
  const migration = readSource("supabase/migrations/010_xy_win_win_game.sql");
  const client = readSource("src/lib/supabase/xy-client.ts");
  const actions = readSource("src/lib/actions/xy-actions.ts");

  it("declares edited_by_mentor and edited_at with explicit defaults", () => {
    const createStart = migration.indexOf(
      "CREATE TABLE IF NOT EXISTS xy_individual_votes"
    );
    const createBlock = migration.slice(
      createStart,
      migration.indexOf("ALTER TABLE xy_individual_votes", createStart)
    );

    expect(createStart).toBeGreaterThan(-1);

    expect(createBlock).toMatch(/edited_by_mentor BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(createBlock).toMatch(/edited_at\s+TIMESTAMPTZ DEFAULT NULL/);
  });

  it("adds and normalises both columns on an older table", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS edited_by_mentor BOOLEAN NOT NULL DEFAULT FALSE"
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL"
    );
    expect(migration).toContain(
      "UPDATE xy_individual_votes SET edited_by_mentor = FALSE WHERE edited_by_mentor IS NULL"
    );
    expect(migration).toMatch(/ALTER COLUMN edited_by_mentor SET NOT NULL/);
    expect(migration).toMatch(
      /SET edited_at = COALESCE\(updated_at, created_at, now\(\)\)\s*\nWHERE edited_by_mentor\s*\n\s*AND edited_at IS NULL/
    );
  });

  it("clears the audit pair when the student re-votes, sets it on override", () => {
    expect(migration).toMatch(/edited_by_mentor = FALSE,\s*\n\s*edited_at = NULL/);
    expect(actions).toContain("edited_by_mentor: true");
    expect(actions).toContain("edited_at: editedAt");
  });

  it("retries with a wildcard select when a column is missing", () => {
    expect(client).toContain("primary.error?.code === UNDEFINED_COLUMN");
    expect(client).toContain('() => query("*")');
  });
});

describe("normalizeXyIndividualVoteRow", () => {
  const row = {
    id: "vote-1",
    session_id: "session-1",
    round_number: 2,
    player_id: "player-1",
    vote: "X",
  };

  it("treats a row without the audit columns as a student vote", () => {
    expect(normalizeXyIndividualVoteRow(row)).toEqual({
      ...row,
      edited_by_mentor: false,
      edited_at: null,
    });
  });

  it("keeps the timestamp on a mentor-edited row", () => {
    expect(
      normalizeXyIndividualVoteRow({
        ...row,
        edited_by_mentor: true,
        edited_at: "2026-07-31T21:15:00.000Z",
      })
    ).toMatchObject({
      edited_by_mentor: true,
      edited_at: "2026-07-31T21:15:00.000Z",
    });
  });

  it("ignores a stale timestamp on a vote the student re-cast", () => {
    expect(
      normalizeXyIndividualVoteRow({
        ...row,
        edited_by_mentor: false,
        edited_at: "2026-07-31T21:15:00.000Z",
      }).edited_at
    ).toBeNull();
  });

  it("coerces junk values instead of throwing", () => {
    expect(
      normalizeXyIndividualVoteRow({
        ...row,
        vote: "maybe",
        round_number: "2",
        edited_by_mentor: "yes",
        edited_at: 1234,
      })
    ).toEqual({
      id: "vote-1",
      session_id: "session-1",
      round_number: 0,
      player_id: "player-1",
      vote: "Y",
      edited_by_mentor: false,
      edited_at: null,
    });
  });
});

describe("resolveXyPlayerName", () => {
  it("prefers real_name and falls back to full_name", () => {
    expect(
      resolveXyPlayerName({ full_name: "ნინო ბერიძე", real_name: "ნინო ბ." })
    ).toBe("ნინო ბ.");
    expect(resolveXyPlayerName({ full_name: "ნინო ბერიძე", real_name: null })).toBe(
      "ნინო ბერიძე"
    );
    expect(resolveXyPlayerName({ full_name: "", real_name: "  ლუკა  " })).toBe("ლუკა");
  });

  it("never renders a blank cell", () => {
    expect(resolveXyPlayerName({ full_name: "   ", real_name: "  " })).toBe(
      XY_UNKNOWN_PLAYER_NAME
    );
    expect(resolveXyPlayerName(null)).toBe(XY_UNKNOWN_PLAYER_NAME);
    expect(resolveXyPlayerName(undefined)).toBe(XY_UNKNOWN_PLAYER_NAME);
  });
});

describe("xy_individual_votes.player_id", () => {
  const migration = readSource("supabase/migrations/010_xy_win_win_game.sql");
  const client = readSource("src/lib/supabase/xy-client.ts");
  const actions = readSource("src/lib/actions/xy-actions.ts");

  it("is declared NOT NULL and cascades from xy_players", () => {
    expect(migration).toMatch(
      /player_id\s+UUID NOT NULL REFERENCES xy_players \(id\) ON DELETE CASCADE/
    );
    expect(migration).toContain(
      "CONSTRAINT uq_xy_individual_votes UNIQUE (session_id, round_number, player_id)"
    );
  });

  it("re-runs safely and restores the NOT NULL + FK guarantees", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS player_id UUID/);
    expect(migration).toContain(
      "DELETE FROM xy_individual_votes WHERE player_id IS NULL"
    );
    expect(migration).toContain(
      "ALTER TABLE xy_individual_votes ALTER COLUMN player_id SET NOT NULL"
    );
    expect(migration).toContain(
      "SELECT 1 FROM pg_constraint WHERE conname = 'xy_individual_votes_player_id_fkey'"
    );
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_xy_individual_votes_player");
  });

  it("is selected, inserted and returned by every code path", () => {
    expect(client).toContain(
      'XY_INDIVIDUAL_VOTE_COLUMNS =\n  "id, session_id, round_number, player_id, vote, edited_by_mentor, edited_at"'
    );
    expect(client).toContain("() => query(XY_INDIVIDUAL_VOTE_COLUMNS)");
    expect(client).toMatch(/player_id: raw\?\.player_id \?\? ""/);

    // The RPC writes it on the student path; the override action on the mentor path.
    expect(migration).toContain(
      "INSERT INTO xy_individual_votes (session_id, round_number, player_id, vote)"
    );
    expect(migration).toContain("'player_id', v_player_id");
    expect(actions).toContain("player_id: input.playerId");
    expect(actions).toMatch(/\.eq\("player_id", input\.playerId\)/);
  });
});
