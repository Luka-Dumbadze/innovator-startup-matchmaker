import type { SupabaseClient } from "@supabase/supabase-js";

import { toDailySession, type Database } from "./types";
import type { DailySession } from "@/types/game";

/**
 * Delay before re-querying the DB when a realtime event suggests the loaded
 * session went inactive. Guards against reading mid-swap state while the admin
 * deactivates one session and activates the next.
 */
export const ACTIVE_SESSION_RECHECK_DELAY_MS = 1000;

/**
 * Fetch the MOST RECENT active session.
 *
 * Never `.single()`: if several rows accidentally carry `is_active = true`,
 * ordering + `limit(1)` returns the newest instead of throwing PGRST116.
 */
export async function fetchLatestActiveSession(
  supabase: SupabaseClient<Database>
): Promise<DailySession | null> {
  const { data, error } = await supabase
    .from("daily_sessions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toDailySession(data) : null;
}

/** Minimal realtime row shape; Supabase payloads are not guaranteed complete. */
export type SessionRealtimeRow = {
  id?: string | null;
  date_label?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  ended_at?: string | null;
  voting_open?: boolean | null;
  voting_team_id?: string | null;
};

export type SessionRealtimeDecision =
  /** Safe to write straight into state (always an active row). */
  | { kind: "apply"; session: DailySession }
  /** Irrelevant payload — must not touch current session state. */
  | { kind: "ignore"; reason: string }
  /** Ambiguous: re-query the DB (after a delay) before changing state. */
  | { kind: "reverify"; reason: string };

function isNewerThan(candidate?: string | null, current?: string | null): boolean {
  if (!candidate) return false;
  if (!current) return true;
  return Date.parse(candidate) >= Date.parse(current);
}

/**
 * Decide how a `daily_sessions` INSERT/UPDATE payload may affect host state.
 *
 * Invariants:
 * - An `is_active = false` row is NEVER applied to state.
 * - A row for a different (older) session NEVER overwrites the live session.
 * - Losing the live session triggers re-verification, not an instant empty screen.
 */
export function resolveRealtimeSessionUpdate(
  current: DailySession | null,
  row: SessionRealtimeRow | null | undefined
): SessionRealtimeDecision {
  if (!row?.id) {
    return { kind: "ignore", reason: "payload missing session id" };
  }

  const isActive = row.is_active === true;
  const isCurrent = current?.id === row.id;

  if (!isActive) {
    if (isCurrent) {
      return { kind: "reverify", reason: "live session reported inactive" };
    }
    return { kind: "ignore", reason: "inactive row for another session" };
  }

  if (isCurrent) {
    return {
      kind: "apply",
      session: toDailySession({
        id: row.id,
        date_label: row.date_label ?? current?.date_label ?? "",
        is_active: true,
        created_at: row.created_at ?? current?.created_at ?? new Date(0).toISOString(),
        ended_at: row.ended_at ?? null,
        voting_open: row.voting_open ?? false,
        voting_team_id: row.voting_team_id ?? null,
      }),
    };
  }

  if (!current) {
    return {
      kind: "apply",
      session: toDailySession({
        id: row.id,
        date_label: row.date_label ?? "",
        is_active: true,
        created_at: row.created_at ?? new Date().toISOString(),
        ended_at: row.ended_at ?? null,
        voting_open: row.voting_open ?? false,
        voting_team_id: row.voting_team_id ?? null,
      }),
    };
  }

  if (isNewerThan(row.created_at, current.created_at)) {
    // A newer session went live — confirm against the DB rather than trusting
    // one payload, so teams load together with the session swap.
    return { kind: "reverify", reason: "newer active session detected" };
  }

  return { kind: "ignore", reason: "older active session row" };
}
