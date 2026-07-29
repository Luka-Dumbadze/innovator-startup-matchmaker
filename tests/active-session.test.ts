import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ACTIVE_SESSION_RECHECK_DELAY_MS,
  fetchLatestActiveSession,
  resolveRealtimeSessionUpdate,
} from "@/lib/supabase/active-session";
import type { DailySession } from "@/types/game";

const LIVE: DailySession = {
  id: "live-session",
  date_label: "Day 9 — Live",
  is_active: true,
  created_at: "2026-07-29T08:00:00.000Z",
  ended_at: null,
  voting_open: false,
  voting_team_id: null,
};

const PAST_SESSION_ROW = {
  id: "past-session",
  date_label: "Day 1 — Yesterday",
  is_active: false,
  created_at: "2026-07-28T08:00:00.000Z",
  ended_at: "2026-07-28T12:00:00.000Z",
};

describe("resolveRealtimeSessionUpdate", () => {
  it("ignores is_active:false payloads from a previous (non-active) session", () => {
    const decision = resolveRealtimeSessionUpdate(LIVE, PAST_SESSION_ROW);

    expect(decision.kind).toBe("ignore");
    if (decision.kind !== "ignore") return;
    expect(decision.reason).toMatch(/another session/);
  });

  it("ignores an older active session row so the live session is never replaced", () => {
    const decision = resolveRealtimeSessionUpdate(LIVE, {
      ...PAST_SESSION_ROW,
      is_active: true,
    });

    expect(decision.kind).toBe("ignore");
  });

  it("ignores payloads without an id", () => {
    expect(resolveRealtimeSessionUpdate(LIVE, {}).kind).toBe("ignore");
    expect(resolveRealtimeSessionUpdate(LIVE, null).kind).toBe("ignore");
  });

  it("applies updates for the current session and keeps it active", () => {
    const decision = resolveRealtimeSessionUpdate(LIVE, {
      id: LIVE.id,
      date_label: LIVE.date_label,
      is_active: true,
      created_at: LIVE.created_at,
      voting_open: true,
      voting_team_id: "team-3",
    });

    expect(decision.kind).toBe("apply");
    if (decision.kind !== "apply") return;
    expect(decision.session.id).toBe(LIVE.id);
    expect(decision.session.is_active).toBe(true);
    expect(decision.session.voting_open).toBe(true);
    expect(decision.session.voting_team_id).toBe("team-3");
  });

  it("adopts an active row when no session is loaded yet", () => {
    const decision = resolveRealtimeSessionUpdate(null, {
      id: "fresh-session",
      date_label: "Day 10",
      is_active: true,
      created_at: "2026-07-30T08:00:00.000Z",
    });

    expect(decision.kind).toBe("apply");
    if (decision.kind !== "apply") return;
    expect(decision.session.id).toBe("fresh-session");
  });

  it("re-verifies instead of clearing state when the live session goes inactive", () => {
    const decision = resolveRealtimeSessionUpdate(LIVE, {
      ...LIVE,
      is_active: false,
      ended_at: "2026-07-29T11:00:00.000Z",
    });

    expect(decision.kind).toBe("reverify");
  });

  it("re-verifies when a newer session becomes active", () => {
    const decision = resolveRealtimeSessionUpdate(LIVE, {
      id: "next-session",
      date_label: "Day 10",
      is_active: true,
      created_at: "2026-07-30T08:00:00.000Z",
    });

    expect(decision.kind).toBe("reverify");
  });

  it("never returns an inactive session to apply", () => {
    const rows = [
      PAST_SESSION_ROW,
      { ...LIVE, is_active: false },
      { id: "other", is_active: false, created_at: "2027-01-01T00:00:00.000Z" },
    ];

    for (const row of rows) {
      const decision = resolveRealtimeSessionUpdate(LIVE, row);
      expect(decision.kind).not.toBe("apply");
    }
  });

  it("uses a 1 second recovery delay", () => {
    expect(ACTIVE_SESSION_RECHECK_DELAY_MS).toBe(1000);
  });
});

describe("fetchLatestActiveSession", () => {
  function makeClient(result: { data: unknown; error: { message: string } | null }) {
    const calls: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        calls[column] = value;
        return builder;
      }),
      order: vi.fn((column: string, opts: { ascending: boolean }) => {
        calls.order = { column, ...opts };
        return builder;
      }),
      limit: vi.fn((n: number) => {
        calls.limit = n;
        return builder;
      }),
      maybeSingle: vi.fn(async () => result),
      single: vi.fn(async () => {
        throw new Error("single() must never be used for active session lookups");
      }),
    };

    return {
      calls,
      builder,
      client: { from: vi.fn(() => builder) },
    };
  }

  it("orders by created_at desc, limits to 1 and uses maybeSingle", async () => {
    const { calls, builder, client } = makeClient({
      data: {
        id: "newest",
        date_label: "Day 9",
        is_active: true,
        created_at: "2026-07-29T08:00:00.000Z",
        ended_at: null,
        voting_open: null,
        voting_team_id: null,
      },
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow test double
    const session = await fetchLatestActiveSession(client as any);

    expect(client.from).toHaveBeenCalledWith("daily_sessions");
    expect(calls.is_active).toBe(true);
    expect(calls.order).toEqual({ column: "created_at", ascending: false });
    expect(calls.limit).toBe(1);
    expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
    expect(builder.single).not.toHaveBeenCalled();
    expect(session?.id).toBe("newest");
    expect(session?.voting_open).toBe(false);
  });

  it("returns null when no session is active", async () => {
    const { client } = makeClient({ data: null, error: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow test double
    expect(await fetchLatestActiveSession(client as any)).toBeNull();
  });

  it("surfaces query errors", async () => {
    const { client } = makeClient({ data: null, error: { message: "boom" } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow test double
    await expect(fetchLatestActiveSession(client as any)).rejects.toThrow("boom");
  });
});

describe("timer / voting invariance over daily_sessions.is_active", () => {
  const timerSources = [
    "src/lib/timer/session-timer.ts",
    "src/hooks/useSessionTimerSync.ts",
    "src/components/host/LiveTimerHost.tsx",
    "src/components/host/PitchSpotlightCard.tsx",
    "src/components/player/VotingCard.tsx",
  ];

  it("never references is_active in timer, pitch or voting code paths", () => {
    for (const relative of timerSources) {
      const source = readFileSync(path.resolve(process.cwd(), relative), "utf8");
      expect(source, `${relative} must not touch is_active`).not.toContain("is_active");
    }
  });

  it("only admin session actions clear is_active", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/lib/actions/admin-actions.ts"),
      "utf8",
    );

    const deactivations = source.match(/is_active:\s*false/g) ?? [];
    // deactivateAllSessions() + endSessionAction()
    expect(deactivations).toHaveLength(2);
  });
});
