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
