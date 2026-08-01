import type { XYPlayer, XYTeam } from "@/types/xy";

export type XYRosterAssignment = {
  playerId: string;
  teamId: string;
};

/** Shown when a roster row carries no usable name at all. */
export const XY_UNKNOWN_PLAYER_NAME = "უცნობი მოთამაშე";

/**
 * The student's display name, tolerating either spelling of the column.
 * `real_name` wins because a half-migrated database can hold a stale or empty
 * `full_name` next to the name the student actually typed.
 */
export function resolveXyPlayerName(
  player: Pick<XYPlayer, "full_name" | "real_name"> | null | undefined
): string {
  const realName = player?.real_name?.trim();
  if (realName) return realName;

  const fullName = player?.full_name?.trim();
  if (fullName) return fullName;

  return XY_UNKNOWN_PLAYER_NAME;
}

/** Shape of a Supabase Realtime `postgres_changes` payload for xy_players. */
export type XyPlayerChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};

/** Turns a raw row (query result or realtime payload) into a roster entry. */
export function normalizeXyPlayerRow(
  row: Record<string, unknown> | null | undefined
): XYPlayer | null {
  if (!row || typeof row.id !== "string" || !row.id) return null;

  const name = resolveXyPlayerName({
    full_name: typeof row.full_name === "string" ? row.full_name : "",
    real_name: typeof row.real_name === "string" ? row.real_name : null,
  });

  return {
    id: row.id,
    session_id: typeof row.session_id === "string" ? row.session_id : "",
    player_uid: typeof row.player_uid === "string" ? row.player_uid : "",
    full_name: name,
    real_name: name,
    team_id: typeof row.team_id === "string" ? row.team_id : null,
    team_number: typeof row.team_number === "number" ? row.team_number : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/**
 * Applies one realtime roster event to the local list so a student who joins on
 * their phone appears on the mentor's screen before the next refetch lands.
 *
 * Returns the original array when nothing changed, keeping React from
 * re-rendering the roster on every unrelated event.
 */
export function applyXyPlayerEvent(
  players: readonly XYPlayer[],
  change: XyPlayerChange,
  sessionId: string
): XYPlayer[] {
  if (change.eventType === "DELETE") {
    const removedId = typeof change.old?.id === "string" ? change.old.id : null;
    if (!removedId) return players as XYPlayer[];

    const next = players.filter((p) => p.id !== removedId);
    return next.length === players.length ? (players as XYPlayer[]) : next;
  }

  const player = normalizeXyPlayerRow(change.new);
  // Rows from a previous session must never leak into the live roster.
  if (!player || (player.session_id && player.session_id !== sessionId)) {
    return players as XYPlayer[];
  }

  const existingIndex = players.findIndex(
    (p) => p.id === player.id || (!!p.player_uid && p.player_uid === player.player_uid)
  );

  if (existingIndex >= 0) {
    const existing = players[existingIndex];
    const merged = { ...existing, ...player };
    if (
      existing.full_name === merged.full_name &&
      existing.team_id === merged.team_id &&
      (existing.team_number ?? null) === (merged.team_number ?? null) &&
      existing.id === merged.id
    ) {
      return players as XYPlayer[];
    }

    const next = [...players];
    next[existingIndex] = merged;
    return next;
  }

  // The snapshot is ordered by join time; keep the merged row in that order.
  return [...players, player].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}

/**
 * Spread the still-unassigned students across the 8 teams, always topping up
 * the smallest team first so existing manual placements stay untouched.
 */
export function balanceUnassignedPlayers(
  players: readonly XYPlayer[],
  teams: readonly XYTeam[]
): XYRosterAssignment[] {
  if (teams.length === 0) return [];

  const counts = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const player of players) {
    if (player.team_id && counts.has(player.team_id)) {
      counts.set(player.team_id, (counts.get(player.team_id) ?? 0) + 1);
    }
  }

  const ordered = [...teams].sort((a, b) => a.team_number - b.team_number);
  const assignments: XYRosterAssignment[] = [];

  for (const player of players) {
    if (player.team_id) continue;

    const target = ordered.reduce((smallest, team) =>
      (counts.get(team.id) ?? 0) < (counts.get(smallest.id) ?? 0) ? team : smallest
    );

    counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
    assignments.push({ playerId: player.id, teamId: target.id });
  }

  return assignments;
}
