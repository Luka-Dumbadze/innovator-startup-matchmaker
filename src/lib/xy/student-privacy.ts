import { computeStandings } from "@/lib/xy/scoring";
import { resolveXySessionLabel } from "@/lib/xy/session-state";
import type {
  XYPlayer,
  XYSession,
  XYSnapshot,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";

/**
 * Cumulative leaderboard row for the student phone — totals only.
 * Round-by-round paper decisions (X/Y) are intentionally absent.
 */
export type XYStudentPublicStanding = {
  teamId: string;
  teamNumber: number;
  name: string;
  color: string;
  totalPoints: number;
};

/** Everything the student mobile screen is allowed to know. */
export type XYStudentSafeView = {
  session: Pick<
    XYSession,
    "id" | "label" | "current_round" | "voting_open" | "is_active" | "status"
  > | null;
  me: XYPlayer | null;
  myVoteForRound: XYVote | null;
  standings: XYStudentPublicStanding[];
};

/**
 * Aggregate team totals without carrying per-round vote letters.
 * Uses `computeStandings` internally but drops `roundVotes` / `roundPoints`.
 */
export function computePublicStandings(
  teams: readonly XYTeam[],
  teamVotes: readonly XYTeamVote[]
): XYStudentPublicStanding[] {
  return computeStandings(teams, teamVotes).map((row) => ({
    teamId: row.team.id,
    teamNumber: row.team.team_number,
    name: row.team.name,
    color: row.team.color,
    totalPoints: row.totalPoints,
  }));
}

/**
 * Projects a full mentor/admin snapshot down to the student-safe surface.
 * Other players' phone votes and every team's round-by-round paper decisions
 * are discarded — only the caller's own vote and cumulative totals remain.
 */
export function toStudentSafeView(
  snapshot: Pick<
    XYSnapshot,
    "session" | "teams" | "players" | "individualVotes" | "teamVotes"
  >,
  playerUid: string | null,
  round?: number
): XYStudentSafeView {
  const session = snapshot.session
    ? {
        id: snapshot.session.id,
        label: snapshot.session.label,
        current_round: snapshot.session.current_round,
        voting_open: snapshot.session.voting_open,
        is_active: snapshot.session.is_active,
        status: snapshot.session.status,
      }
    : null;

  const activeRound = round ?? session?.current_round ?? 1;

  const me = playerUid
    ? (snapshot.players.find((p) => p.player_uid === playerUid) ?? null)
    : null;

  const myVoteForRound = me
    ? (snapshot.individualVotes.find(
        (v) => v.player_id === me.id && v.round_number === activeRound
      )?.vote ?? null)
    : null;

  return {
    session,
    me,
    myVoteForRound,
    standings: computePublicStandings(snapshot.teams, snapshot.teamVotes),
  };
}

/**
 * Walks a student-facing payload and returns human-readable leak descriptions.
 * Used by unit tests to prove round-by-round team decisions never leave the
 * privacy boundary.
 */
export function findStudentPrivacyLeaks(view: unknown): string[] {
  const leaks: string[] = [];

  if (!view || typeof view !== "object") {
    return leaks;
  }

  const record = view as Record<string, unknown>;

  if ("teamVotes" in record) {
    leaks.push("teamVotes array must not appear on the student view");
  }
  if ("individualVotes" in record) {
    leaks.push("individualVotes array must not appear on the student view");
  }
  if ("roundVotes" in record) {
    leaks.push("roundVotes map must not appear on the student view");
  }
  if ("roundPoints" in record) {
    leaks.push("roundPoints map must not appear on the student view");
  }

  const standings = record.standings;
  if (Array.isArray(standings)) {
    for (const [index, row] of standings.entries()) {
      if (!row || typeof row !== "object") continue;
      const standing = row as Record<string, unknown>;

      if ("roundVotes" in standing || "vote" in standing || "votes" in standing) {
        leaks.push(
          `standings[${index}] carries round-by-round team decisions`
        );
      }

      for (const [key, value] of Object.entries(standing)) {
        if (
          typeof value === "string" &&
          (value === "X" || value === "Y") &&
          key !== "name" &&
          key !== "color" &&
          key !== "teamId"
        ) {
          leaks.push(`standings[${index}].${key} looks like a paper vote`);
        }
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.values(value as Record<string, unknown>).some(
            (entry) => entry === "X" || entry === "Y"
          )
        ) {
          leaks.push(
            `standings[${index}].${key} embeds per-round X/Y decisions`
          );
        }
      }
    }
  }

  return leaks;
}

/** Test helper: true when the payload is free of team-decision leaks. */
export function isStudentViewPrivate(view: unknown): boolean {
  return findStudentPrivacyLeaks(view).length === 0;
}

/** Projector-safe board: session chrome + cumulative standings only. */
export type XYScoreboardSafeView = {
  sessionTitle: string;
  currentRound: number;
  votingOpen: boolean;
  standings: XYStudentPublicStanding[];
};

/**
 * Projects live snapshot data onto the public scoreboard surface.
 * Round columns, paper X/Y decisions, and per-round deltas are dropped.
 */
export function toScoreboardSafeView(
  snapshot: Pick<XYSnapshot, "session" | "teams" | "teamVotes">
): XYScoreboardSafeView | null {
  if (!snapshot.session) return null;

  return {
    sessionTitle: resolveXySessionLabel(snapshot.session.label),
    currentRound: snapshot.session.current_round,
    votingOpen: snapshot.session.voting_open === true,
    standings: computePublicStandings(snapshot.teams, snapshot.teamVotes),
  };
}

/**
 * Same privacy rules as the student phone: no teamVotes payload, no per-round
 * decision maps, no X/Y deltas on standing rows.
 */
export function findScoreboardPrivacyLeaks(view: unknown): string[] {
  const leaks = findStudentPrivacyLeaks(view);

  if (!view || typeof view !== "object") {
    return leaks;
  }

  const record = view as Record<string, unknown>;

  if ("rounds" in record) {
    leaks.push("rounds list must not appear on the scoreboard view");
  }
  if ("roundNumbers" in record) {
    leaks.push("roundNumbers must not appear on the scoreboard view");
  }

  for (const key of Object.keys(record)) {
    if (/^r\d+$/i.test(key) || /^round\d+/i.test(key)) {
      leaks.push(`scoreboard view exposes round column key "${key}"`);
    }
  }

  const standings = record.standings;
  if (Array.isArray(standings)) {
    for (const [index, row] of standings.entries()) {
      if (!row || typeof row !== "object") continue;
      const standing = row as Record<string, unknown>;
      if ("roundPoints" in standing) {
        leaks.push(`standings[${index}] carries per-round point deltas`);
      }
      for (const key of Object.keys(standing)) {
        if (/^r\d+$/i.test(key)) {
          leaks.push(`standings[${index}] exposes round column "${key}"`);
        }
      }
    }
  }

  return leaks;
}

export function isScoreboardViewPrivate(view: unknown): boolean {
  return findScoreboardPrivacyLeaks(view).length === 0;
}
