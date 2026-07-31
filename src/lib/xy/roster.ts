import type { XYPlayer, XYTeam } from "@/types/xy";

export type XYRosterAssignment = {
  playerId: string;
  teamId: string;
};

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
