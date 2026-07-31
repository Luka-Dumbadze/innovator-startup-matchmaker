import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { fetchActiveXySession } from "@/lib/supabase/xy-client";
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

describe("fetchActiveXySession", () => {
  function buildSupabaseStub(row: XYSession | null) {
    const calls: [string, unknown][] = [];

    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([column, value]);
        return builder;
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    };

    const supabase = { from: vi.fn(() => builder) };
    return { supabase, builder, calls };
  }

  it("filters on is_active AND status, newest first", async () => {
    const row = makeSession();
    const { supabase, builder, calls } = buildSupabaseStub(row);

    const result = await fetchActiveXySession(
      supabase as unknown as Parameters<typeof fetchActiveXySession>[0]
    );

    expect(result).toEqual(row);
    expect(calls).toEqual([
      ["is_active", true],
      ["status", "active"],
    ]);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("returns null when no session is live", async () => {
    const { supabase } = buildSupabaseStub(null);
    await expect(
      fetchActiveXySession(
        supabase as unknown as Parameters<typeof fetchActiveXySession>[0]
      )
    ).resolves.toBeNull();
  });

  it("discards a drifted row even if the query returned one", async () => {
    const { supabase } = buildSupabaseStub(makeSession({ status: "completed" }));
    await expect(
      fetchActiveXySession(
        supabase as unknown as Parameters<typeof fetchActiveXySession>[0]
      )
    ).resolves.toBeNull();
  });

  it("surfaces query errors", async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
    };
    const supabase = { from: vi.fn(() => builder) };

    await expect(
      fetchActiveXySession(
        supabase as unknown as Parameters<typeof fetchActiveXySession>[0]
      )
    ).rejects.toThrow("boom");
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

  it("selects and inserts label through the shared column list", () => {
    const client = readSource("src/lib/supabase/xy-client.ts");
    expect(client).toMatch(/XY_SESSION_COLUMNS\s*=\s*\n?\s*"id, label, is_active, status/);
    expect(client).toContain(".select(XY_SESSION_COLUMNS)");
    expect(actions).toContain(".select(XY_SESSION_COLUMNS)");
    expect(actions).toContain("label: cleanLabel");
    expect(actions).toContain("resolveXySessionLabel(label)");
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

  it("never flips is_active without status", () => {
    expect(actions).not.toMatch(/is_active:\s*(true|false)/);
    expect(actions).toContain("xySessionStartPatch()");
    expect(actions).toContain("xySessionEndPatch()");
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
