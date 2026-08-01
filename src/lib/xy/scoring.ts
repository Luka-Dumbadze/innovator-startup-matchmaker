import type {
  XYAlignment,
  XYIndividualVote,
  XYPlayer,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";
import { resolveXyPlayerName } from "@/lib/xy/roster";

/** A full XY round is scored across exactly 8 team decisions. */
export const XY_TEAM_COUNT = 8;

export type XYPayoff = {
  /** Points awarded to each team that voted Y. */
  yPoints: number;
  /** Points awarded to each team that voted X. */
  xPoints: number;
};

/**
 * 8-team payoff matrix keyed by how many of the 8 teams voted Y.
 *
 * 8Y → everyone cooperates and wins; a lone X defector profits most while
 * punishing the cooperators; a lone remaining Y is hit hardest (−50).
 */
export const XY_PAYOFF_MATRIX: Readonly<Record<number, XYPayoff>> = Object.freeze({
  8: { yPoints: 10, xPoints: 0 },
  7: { yPoints: -25, xPoints: 15 },
  6: { yPoints: -20, xPoints: 10 },
  5: { yPoints: -15, xPoints: 5 },
  4: { yPoints: -10, xPoints: 0 },
  3: { yPoints: -5, xPoints: 0 },
  2: { yPoints: -2, xPoints: 0 },
  1: { yPoints: -50, xPoints: 0 },
  0: { yPoints: 0, xPoints: 0 },
});

/** Human-readable matrix rows for mentor / projector legends. */
export const XY_MATRIX_LEGEND: readonly {
  label: string;
  yPoints: number;
  xPoints: number;
}[] = [
  { label: "8Y / 0X", yPoints: 10, xPoints: 0 },
  { label: "7Y / 1X", yPoints: -25, xPoints: 15 },
  { label: "6Y / 2X", yPoints: -20, xPoints: 10 },
  { label: "5Y / 3X", yPoints: -15, xPoints: 5 },
  { label: "4Y / 4X", yPoints: -10, xPoints: 0 },
  { label: "3Y / 5X", yPoints: -5, xPoints: 0 },
  { label: "2Y / 6X", yPoints: -2, xPoints: 0 },
  { label: "1Y / 7X", yPoints: -50, xPoints: 0 },
  { label: "0Y / 8X", yPoints: 0, xPoints: 0 },
];

export function parseXYVote(value: unknown): XYVote | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return upper === "X" || upper === "Y" ? upper : null;
}

export type XYRoundScore = {
  /** True only when all 8 team decisions are present. */
  complete: boolean;
  yCount: number;
  xCount: number;
  payoff: XYPayoff;
};

/**
 * Score one round from the team paper votes.
 * Incomplete rounds award zero points until all 8 decisions are entered.
 */
export function scoreRound(votes: readonly XYVote[]): XYRoundScore {
  const yCount = votes.filter((v) => v === "Y").length;
  const xCount = votes.filter((v) => v === "X").length;
  const complete = votes.length === XY_TEAM_COUNT;

  if (!complete) {
    return { complete, yCount, xCount, payoff: { yPoints: 0, xPoints: 0 } };
  }

  return {
    complete,
    yCount,
    xCount,
    payoff: XY_PAYOFF_MATRIX[yCount] ?? { yPoints: 0, xPoints: 0 },
  };
}

/** Points a single team earns given its vote and the round's Y count. */
export function pointsForVote(vote: XYVote, roundScore: XYRoundScore): number {
  if (!roundScore.complete) return 0;
  return vote === "Y" ? roundScore.payoff.yPoints : roundScore.payoff.xPoints;
}

export type XYRoundTeamPoints = {
  teamId: string;
  vote: XYVote;
  points: number;
};

/** Recompute every team's points for one round (used after any mentor edit). */
export function scoreRoundForTeams(
  entries: readonly { teamId: string; vote: XYVote }[]
): { round: XYRoundScore; results: XYRoundTeamPoints[] } {
  const round = scoreRound(entries.map((e) => e.vote));
  return {
    round,
    results: entries.map((e) => ({
      teamId: e.teamId,
      vote: e.vote,
      points: pointsForVote(e.vote, round),
    })),
  };
}

export type XYTeamStanding = {
  team: XYTeam;
  totalPoints: number;
  /** Round number → paper decision (absent when not entered yet). */
  roundVotes: Record<number, XYVote | undefined>;
  roundPoints: Record<number, number | undefined>;
};

/** Cumulative scoreboard rows, ranked by points then team number. */
export function computeStandings(
  teams: readonly XYTeam[],
  teamVotes: readonly XYTeamVote[]
): XYTeamStanding[] {
  const standings = teams.map<XYTeamStanding>((team) => {
    const votes = teamVotes.filter((v) => v.team_id === team.id);
    const roundVotes: Record<number, XYVote | undefined> = {};
    const roundPoints: Record<number, number | undefined> = {};

    for (const v of votes) {
      roundVotes[v.round_number] = v.vote;
      roundPoints[v.round_number] = v.points;
    }

    return {
      team,
      totalPoints: votes.reduce((sum, v) => sum + v.points, 0),
      roundVotes,
      roundPoints,
    };
  });

  return standings.sort(
    (a, b) => b.totalPoints - a.totalPoints || a.team.team_number - b.team.team_number
  );
}

/** Highest round number that has any data (team or phone votes). */
export function resolveRoundNumbers(
  individualVotes: readonly XYIndividualVote[],
  teamVotes: readonly XYTeamVote[],
  currentRound = 1
): number[] {
  const maxRound = Math.max(
    currentRound,
    ...individualVotes.map((v) => v.round_number),
    ...teamVotes.map((v) => v.round_number),
    1
  );
  return Array.from({ length: maxRound }, (_, i) => i + 1);
}

/**
 * Compare a student's private phone vote with their team's public paper vote.
 *
 * - Team said Y (cooperate) but student tapped X → stealth defector.
 * - Team said X (defect) but student tapped Y → secret altruist.
 */
export function classifyAlignment(
  paperVote: XYVote | undefined,
  phoneVote: XYVote | undefined
): XYAlignment {
  if (!paperVote || !phoneVote) return "incomplete";
  if (paperVote === phoneVote) return "aligned";
  return paperVote === "Y" ? "stealth_defector" : "secret_altruist";
}

export const XY_ALIGNMENT_BADGE: Readonly<Record<XYAlignment, string>> = Object.freeze({
  stealth_defector: "🚨 Stealth Defector",
  secret_altruist: "💚 Secret Altruist",
  aligned: "✓",
  incomplete: "—",
});

export type XYAnalyticsCell = {
  round: number;
  phoneVote: XYVote | undefined;
  paperVote: XYVote | undefined;
  alignment: XYAlignment;
};

export type XYAnalyticsRow = {
  player: XYPlayer;
  teamName: string;
  teamNumber: number | null;
  cells: XYAnalyticsCell[];
  stealthDefections: number;
  secretAltruism: number;
};

/** Per-student, per-round phone vs paper comparison table. */
export function buildAnalyticsRows(input: {
  players: readonly XYPlayer[];
  teams: readonly XYTeam[];
  individualVotes: readonly XYIndividualVote[];
  teamVotes: readonly XYTeamVote[];
  rounds: readonly number[];
}): XYAnalyticsRow[] {
  const teamById = new Map(input.teams.map((t) => [t.id, t]));

  const phoneByKey = new Map<string, XYVote>();
  for (const vote of input.individualVotes) {
    phoneByKey.set(`${vote.player_id}:${vote.round_number}`, vote.vote);
  }

  const paperByKey = new Map<string, XYVote>();
  for (const vote of input.teamVotes) {
    paperByKey.set(`${vote.team_id}:${vote.round_number}`, vote.vote);
  }

  const rows = input.players.map<XYAnalyticsRow>((player) => {
    const team = player.team_id ? teamById.get(player.team_id) : undefined;

    const cells = input.rounds.map<XYAnalyticsCell>((round) => {
      const phoneVote = phoneByKey.get(`${player.id}:${round}`);
      const paperVote = team ? paperByKey.get(`${team.id}:${round}`) : undefined;
      return {
        round,
        phoneVote,
        paperVote,
        alignment: classifyAlignment(paperVote, phoneVote),
      };
    });

    return {
      player,
      teamName: team?.name ?? "— გუნდის გარეშე",
      teamNumber: team?.team_number ?? null,
      cells,
      stealthDefections: cells.filter((c) => c.alignment === "stealth_defector").length,
      secretAltruism: cells.filter((c) => c.alignment === "secret_altruist").length,
    };
  });

  return rows.sort(
    (a, b) =>
      (a.teamNumber ?? 99) - (b.teamNumber ?? 99) ||
      resolveXyPlayerName(a.player).localeCompare(resolveXyPlayerName(b.player))
  );
}

export type XYSubmissionProgress = {
  submitted: number;
  total: number;
  pending: XYPlayer[];
  submittedPlayers: XYPlayer[];
  label: string;
};

/** Live "38 / 40 სტუდენტმა მისცა ხმა" progress for the active round. */
export function computeSubmissionProgress(
  players: readonly XYPlayer[],
  individualVotes: readonly XYIndividualVote[],
  round: number
): XYSubmissionProgress {
  const votedPlayerIds = new Set(
    individualVotes.filter((v) => v.round_number === round).map((v) => v.player_id)
  );

  const submittedPlayers = players.filter((p) => votedPlayerIds.has(p.id));
  const pending = players.filter((p) => !votedPlayerIds.has(p.id));

  return {
    submitted: submittedPlayers.length,
    total: players.length,
    pending,
    submittedPlayers,
    label: `${submittedPlayers.length} / ${players.length} სტუდენტმა მისცა ხმა`,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Full analytics CSV: one row per student, phone + paper columns per round. */
export function buildAnalyticsCsv(
  rows: readonly XYAnalyticsRow[],
  rounds: readonly number[]
): string {
  const header = [
    "Student Name",
    "Team Number",
    "Team Name",
    ...rounds.flatMap((r) => [`R${r} Phone`, `R${r} Paper`, `R${r} Flag`]),
    "Stealth Defections",
    "Secret Altruism",
  ];

  const lines = [header.map(csvEscape).join(",")];

  for (const row of rows) {
    const cols = [
      resolveXyPlayerName(row.player),
      row.teamNumber === null ? "—" : String(row.teamNumber),
      row.teamName,
      ...row.cells.flatMap((cell) => [
        cell.phoneVote ?? "—",
        cell.paperVote ?? "—",
        XY_ALIGNMENT_BADGE[cell.alignment],
      ]),
      String(row.stealthDefections),
      String(row.secretAltruism),
    ];
    lines.push(cols.map(csvEscape).join(","));
  }

  return lines.join("\n");
}

export type XYAnalyticsResult = {
  rounds: number[];
  rows: XYAnalyticsRow[];
  csv: string;
};

/**
 * Full post-game analytics pipeline: round list, per-student alignment rows,
 * and the CSV export string. Kept allocation-light for hour-long sessions.
 */
export function computeXyAnalytics(input: {
  players: readonly XYPlayer[];
  teams: readonly XYTeam[];
  individualVotes: readonly XYIndividualVote[];
  teamVotes: readonly XYTeamVote[];
  currentRound?: number;
}): XYAnalyticsResult {
  const rounds = resolveRoundNumbers(
    input.individualVotes,
    input.teamVotes,
    input.currentRound ?? 1
  );
  const rows = buildAnalyticsRows({ ...input, rounds });
  return { rounds, rows, csv: buildAnalyticsCsv(rows, rounds) };
}

/** Default Georgian team names for a fresh 8-team XY session. */
export const XY_DEFAULT_TEAMS: readonly { name: string; color: string }[] = [
  { name: "ლურჯები", color: "#2563EB" },
  { name: "მწვანეები", color: "#059669" },
  { name: "წითლები", color: "#E11D48" },
  { name: "ყვითლები", color: "#D97706" },
  { name: "იისფრები", color: "#7C3AED" },
  { name: "ცისფრები", color: "#0891B2" },
  { name: "ნარინჯისფრები", color: "#EA580C" },
  { name: "ვარდისფრები", color: "#DB2777" },
];
