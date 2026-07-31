import { describe, expect, it } from "vitest";

import {
  XY_ALIGNMENT_BADGE,
  XY_DEFAULT_TEAMS,
  XY_MATRIX_LEGEND,
  XY_PAYOFF_MATRIX,
  XY_TEAM_COUNT,
  buildAnalyticsCsv,
  buildAnalyticsRows,
  classifyAlignment,
  computeStandings,
  computeSubmissionProgress,
  parseXYVote,
  pointsForVote,
  resolveRoundNumbers,
  scoreRound,
  scoreRoundForTeams,
} from "@/lib/xy/scoring";
import { balanceUnassignedPlayers } from "@/lib/xy/roster";
import type {
  XYIndividualVote,
  XYPlayer,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";

function makeTeams(count = XY_TEAM_COUNT): XYTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `team-${i + 1}`,
    session_id: "session-1",
    team_number: i + 1,
    name: XY_DEFAULT_TEAMS[i]?.name ?? `Team ${i + 1}`,
    color: "#2563EB",
    created_at: "2026-07-31T09:00:00.000Z",
  }));
}

function makePlayer(
  id: string,
  fullName: string,
  teamId: string | null
): XYPlayer {
  return {
    id,
    session_id: "session-1",
    player_uid: `uid-${id}`,
    full_name: fullName,
    team_id: teamId,
    created_at: "2026-07-31T10:00:00.000Z",
  };
}

function makeTeamVote(
  teamId: string,
  round: number,
  vote: XYVote,
  points: number
): XYTeamVote {
  return {
    id: `tv-${teamId}-${round}`,
    session_id: "session-1",
    round_number: round,
    team_id: teamId,
    vote,
    points,
  };
}

function makeIndividualVote(
  playerId: string,
  round: number,
  vote: XYVote
): XYIndividualVote {
  return {
    id: `iv-${playerId}-${round}`,
    session_id: "session-1",
    round_number: round,
    player_id: playerId,
    vote,
    edited_by_mentor: false,
  };
}

/** yCount → [expected Y points, expected X points] straight from the brief. */
const EXPECTED_MATRIX: [number, number, number][] = [
  [8, 10, 0],
  [7, -20, 10],
  [6, -15, 5],
  [5, -10, 0],
  [4, -5, 0],
  [3, -2, 0],
  [2, -2, 0],
  [1, -2, 0],
  [0, 0, 0],
];

describe("XY payoff matrix", () => {
  it.each(EXPECTED_MATRIX)(
    "%iY pays Y %i and X %i",
    (yCount, yPoints, xPoints) => {
      expect(XY_PAYOFF_MATRIX[yCount]).toEqual({ yPoints, xPoints });
    }
  );

  it("exposes a legend row for every 8-team split", () => {
    expect(XY_MATRIX_LEGEND).toHaveLength(9);
    for (const [yCount, yPoints, xPoints] of EXPECTED_MATRIX) {
      const row = XY_MATRIX_LEGEND.find(
        (r) => r.label === `${yCount}Y / ${XY_TEAM_COUNT - yCount}X`
      );
      expect(row).toEqual({
        label: `${yCount}Y / ${XY_TEAM_COUNT - yCount}X`,
        yPoints,
        xPoints,
      });
    }
  });

  it("cannot be mutated at runtime", () => {
    expect(Object.isFrozen(XY_PAYOFF_MATRIX)).toBe(true);
  });
});

describe("parseXYVote", () => {
  it("normalizes casing and whitespace", () => {
    expect(parseXYVote(" y ")).toBe("Y");
    expect(parseXYVote("x")).toBe("X");
  });

  it("rejects anything else", () => {
    expect(parseXYVote("z")).toBeNull();
    expect(parseXYVote("")).toBeNull();
    expect(parseXYVote(null)).toBeNull();
    expect(parseXYVote(1)).toBeNull();
  });
});

describe("scoreRound", () => {
  it("pays every team +10 when all 8 cooperate", () => {
    const score = scoreRound(Array.from({ length: 8 }, () => "Y" as XYVote));
    expect(score).toEqual({
      complete: true,
      yCount: 8,
      xCount: 0,
      payoff: { yPoints: 10, xPoints: 0 },
    });
  });

  it("punishes cooperators hardest against a lone defector", () => {
    const votes: XYVote[] = ["Y", "Y", "Y", "Y", "Y", "Y", "Y", "X"];
    const score = scoreRound(votes);
    expect(score.yCount).toBe(7);
    expect(pointsForVote("Y", score)).toBe(-20);
    expect(pointsForVote("X", score)).toBe(10);
  });

  it("awards nothing while fewer than 8 decisions are entered", () => {
    const score = scoreRound(["Y", "Y", "Y"]);
    expect(score.complete).toBe(false);
    expect(score.payoff).toEqual({ yPoints: 0, xPoints: 0 });
    expect(pointsForVote("Y", score)).toBe(0);
    expect(pointsForVote("X", score)).toBe(0);
  });

  it("gives zero to everyone when all 8 defect", () => {
    const score = scoreRound(Array.from({ length: 8 }, () => "X" as XYVote));
    expect(score.complete).toBe(true);
    expect(pointsForVote("X", score)).toBe(0);
  });
});

describe("scoreRoundForTeams", () => {
  it("assigns per-team points for a 6Y/2X round", () => {
    const votes: XYVote[] = ["Y", "Y", "Y", "Y", "Y", "Y", "X", "X"];
    const entries = votes.map((vote, i) => ({ teamId: `team-${i + 1}`, vote }));

    const { round, results } = scoreRoundForTeams(entries);

    expect(round.complete).toBe(true);
    expect(results.filter((r) => r.vote === "Y").every((r) => r.points === -15)).toBe(
      true
    );
    expect(results.filter((r) => r.vote === "X").every((r) => r.points === 5)).toBe(
      true
    );
    expect(results).toHaveLength(8);
  });

  it("zeroes points for a partially entered round", () => {
    const { round, results } = scoreRoundForTeams([
      { teamId: "team-1", vote: "Y" },
      { teamId: "team-2", vote: "X" },
    ]);

    expect(round.complete).toBe(false);
    expect(results.every((r) => r.points === 0)).toBe(true);
  });
});

describe("computeStandings", () => {
  const teams = makeTeams();

  it("accumulates points and ranks by total then team number", () => {
    const teamVotes: XYTeamVote[] = [
      // Round 1: 7Y / 1X — team 8 defects.
      ...teams.slice(0, 7).map((t) => makeTeamVote(t.id, 1, "Y", -20)),
      makeTeamVote("team-8", 1, "X", 10),
      // Round 2: everyone cooperates.
      ...teams.map((t) => makeTeamVote(t.id, 2, "Y", 10)),
    ];

    const standings = computeStandings(teams, teamVotes);

    expect(standings[0]?.team.id).toBe("team-8");
    expect(standings[0]?.totalPoints).toBe(20);
    expect(standings[1]?.totalPoints).toBe(-10);
    expect(standings.at(-1)?.totalPoints).toBe(-10);
    expect(standings[1]?.team.team_number).toBe(1);
    expect(standings[0]?.roundVotes[1]).toBe("X");
    expect(standings[0]?.roundPoints[2]).toBe(10);
  });

  it("reports zero for teams with no recorded decisions", () => {
    const standings = computeStandings(teams, []);
    expect(standings).toHaveLength(8);
    expect(standings.every((s) => s.totalPoints === 0)).toBe(true);
    expect(standings.map((s) => s.team.team_number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});

describe("resolveRoundNumbers", () => {
  it("covers every round that has data", () => {
    expect(
      resolveRoundNumbers(
        [makeIndividualVote("p1", 2, "X")],
        [makeTeamVote("team-1", 4, "Y", 10)],
        1
      )
    ).toEqual([1, 2, 3, 4]);
  });

  it("falls back to the active round when nothing is recorded", () => {
    expect(resolveRoundNumbers([], [], 3)).toEqual([1, 2, 3]);
    expect(resolveRoundNumbers([], [])).toEqual([1]);
  });
});

describe("classifyAlignment", () => {
  it("flags a stealth defector when the team cooperated but the phone defected", () => {
    expect(classifyAlignment("Y", "X")).toBe("stealth_defector");
  });

  it("flags a secret altruist when the team defected but the phone cooperated", () => {
    expect(classifyAlignment("X", "Y")).toBe("secret_altruist");
  });

  it("marks matching votes as aligned", () => {
    expect(classifyAlignment("Y", "Y")).toBe("aligned");
    expect(classifyAlignment("X", "X")).toBe("aligned");
  });

  it("marks missing data as incomplete", () => {
    expect(classifyAlignment(undefined, "Y")).toBe("incomplete");
    expect(classifyAlignment("Y", undefined)).toBe("incomplete");
    expect(classifyAlignment(undefined, undefined)).toBe("incomplete");
  });
});

describe("buildAnalyticsRows", () => {
  const teams = makeTeams(2);
  const players = [
    makePlayer("p1", "ნინო ბერიძე", "team-1"),
    makePlayer("p2", "ანა გელაშვილი", "team-1"),
    makePlayer("p3", "გიორგი მაისურაძე", "team-2"),
    makePlayer("p4", "სოლო სტუდენტი", null),
  ];

  const teamVotes = [
    makeTeamVote("team-1", 1, "Y", 10),
    makeTeamVote("team-2", 1, "X", 0),
    makeTeamVote("team-1", 2, "X", 0),
  ];

  const individualVotes = [
    makeIndividualVote("p1", 1, "X"), // stealth defector
    makeIndividualVote("p2", 1, "Y"), // aligned
    makeIndividualVote("p3", 1, "Y"), // secret altruist
    makeIndividualVote("p1", 2, "Y"), // secret altruist in round 2
    makeIndividualVote("p4", 1, "Y"), // no team → incomplete
  ];

  const rows = buildAnalyticsRows({
    players,
    teams,
    individualVotes,
    teamVotes,
    rounds: [1, 2],
  });

  it("sorts by team number then student name", () => {
    expect(rows.map((r) => r.player.id)).toEqual(["p2", "p1", "p3", "p4"]);
  });

  it("pairs each student's phone vote with their team's paper vote", () => {
    const nino = rows.find((r) => r.player.id === "p1");
    expect(nino?.teamName).toBe(teams[0]?.name);
    expect(nino?.cells[0]).toEqual({
      round: 1,
      phoneVote: "X",
      paperVote: "Y",
      alignment: "stealth_defector",
    });
    expect(nino?.cells[1]?.alignment).toBe("secret_altruist");
    expect(nino?.stealthDefections).toBe(1);
    expect(nino?.secretAltruism).toBe(1);
  });

  it("detects secret altruists and leaves aligned students unflagged", () => {
    const altruist = rows.find((r) => r.player.id === "p3");
    expect(altruist?.secretAltruism).toBe(1);
    expect(altruist?.stealthDefections).toBe(0);

    const aligned = rows.find((r) => r.player.id === "p2");
    expect(aligned?.cells[0]?.alignment).toBe("aligned");
    expect(aligned?.stealthDefections).toBe(0);
    expect(aligned?.secretAltruism).toBe(0);
  });

  it("keeps team-less students visible but unflagged", () => {
    const solo = rows.find((r) => r.player.id === "p4");
    expect(solo?.teamNumber).toBeNull();
    expect(solo?.cells.every((c) => c.alignment === "incomplete")).toBe(true);
  });

  it("marks rounds with no data as incomplete", () => {
    const aligned = rows.find((r) => r.player.id === "p2");
    expect(aligned?.cells[1]).toEqual({
      round: 2,
      phoneVote: undefined,
      paperVote: "X",
      alignment: "incomplete",
    });
  });
});

describe("computeSubmissionProgress", () => {
  const players = Array.from({ length: 40 }, (_, i) =>
    makePlayer(`p${i + 1}`, `Student ${i + 1}`, "team-1")
  );
  const votes = players
    .slice(0, 38)
    .map((p) => makeIndividualVote(p.id, 3, "Y"));

  it("counts submissions for the requested round only", () => {
    const progress = computeSubmissionProgress(players, votes, 3);
    expect(progress.submitted).toBe(38);
    expect(progress.total).toBe(40);
    expect(progress.label).toBe("38 / 40 სტუდენტმა მისცა ხმა");
    expect(progress.pending.map((p) => p.id)).toEqual(["p39", "p40"]);
    expect(progress.submittedPlayers).toHaveLength(38);
  });

  it("treats another round as untouched", () => {
    const progress = computeSubmissionProgress(players, votes, 4);
    expect(progress.submitted).toBe(0);
    expect(progress.pending).toHaveLength(40);
  });

  it("handles an empty roster without dividing by zero", () => {
    const progress = computeSubmissionProgress([], [], 1);
    expect(progress.label).toBe("0 / 0 სტუდენტმა მისცა ხმა");
  });
});

describe("buildAnalyticsCsv", () => {
  const teams = makeTeams(1);
  const rows = buildAnalyticsRows({
    players: [makePlayer("p1", 'ნინო "ნინი", ბერიძე', "team-1")],
    teams,
    individualVotes: [makeIndividualVote("p1", 1, "X")],
    teamVotes: [makeTeamVote("team-1", 1, "Y", -20)],
    rounds: [1],
  });

  const csv = buildAnalyticsCsv(rows, [1]);
  const lines = csv.split("\n");

  it("emits phone, paper and flag columns per round", () => {
    expect(lines[0]).toBe(
      "Student Name,Team Number,Team Name,R1 Phone,R1 Paper,R1 Flag,Stealth Defections,Secret Altruism"
    );
  });

  it("escapes quotes and commas in student names", () => {
    expect(lines[1]).toContain('"ნინო ""ნინი"", ბერიძე"');
  });

  it("includes the defection badge and totals", () => {
    expect(lines[1]).toContain(XY_ALIGNMENT_BADGE.stealth_defector);
    expect(lines[1]?.endsWith(",1,0")).toBe(true);
  });

  it("exports a student whose row only carries real_name", () => {
    const legacyRows = buildAnalyticsRows({
      players: [
        { ...makePlayer("p1", "", "team-1"), real_name: "ლუკა კაპანაძე" },
      ],
      teams,
      individualVotes: [makeIndividualVote("p1", 1, "Y")],
      teamVotes: [makeTeamVote("team-1", 1, "Y", 10)],
      rounds: [1],
    });

    expect(buildAnalyticsCsv(legacyRows, [1])).toContain("ლუკა კაპანაძე");
  });
});

describe("balanceUnassignedPlayers", () => {
  const teams = makeTeams();

  it("spreads 40 students evenly across 8 teams", () => {
    const players = Array.from({ length: 40 }, (_, i) =>
      makePlayer(`p${i + 1}`, `Student ${i + 1}`, null)
    );

    const assignments = balanceUnassignedPlayers(players, teams);
    expect(assignments).toHaveLength(40);

    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.teamId, (counts.get(a.teamId) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual(Array.from({ length: 8 }, () => 5));
  });

  it("tops up the smallest teams and never moves manual placements", () => {
    const players = [
      makePlayer("a", "A", "team-1"),
      makePlayer("b", "B", "team-1"),
      makePlayer("c", "C", "team-2"),
      makePlayer("d", "D", null),
      makePlayer("e", "E", null),
    ];

    const assignments = balanceUnassignedPlayers(players, teams);
    expect(assignments.map((a) => a.playerId)).toEqual(["d", "e"]);
    expect(assignments.map((a) => a.teamId)).toEqual(["team-3", "team-4"]);
  });

  it("returns nothing when there are no teams or nobody waiting", () => {
    expect(balanceUnassignedPlayers([makePlayer("a", "A", null)], [])).toEqual([]);
    expect(balanceUnassignedPlayers([makePlayer("a", "A", "team-1")], teams)).toEqual(
      []
    );
  });
});
