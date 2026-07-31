import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { fetchActiveXySession } from "@/lib/supabase/xy-client";
import {
  XY_STATUS_ACTIVE,
  XY_STATUS_COMPLETED,
  isXySessionLive,
  parseXySessionStatus,
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

  it("declares is_active and status with active defaults", () => {
    expect(migration).toMatch(/is_active\s+BOOLEAN NOT NULL DEFAULT TRUE/);
    expect(migration).toMatch(/status\s+TEXT NOT NULL DEFAULT 'active'/);
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
      /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'/
    );
    expect(migration).toContain("FROM pg_constraint WHERE conname =");
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
