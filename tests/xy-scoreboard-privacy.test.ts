import { describe, expect, it } from "vitest";

import {
  findScoreboardPrivacyLeaks,
  isScoreboardViewPrivate,
  toScoreboardSafeView,
} from "@/lib/xy/student-privacy";
import type { XYSession, XYTeam, XYTeamVote } from "@/types/xy";

function makeSession(overrides: Partial<XYSession> = {}): XYSession {
  return {
    id: "session-1",
    label: "XY თამაში — დღე 3",
    is_active: true,
    status: "active",
    current_round: 4,
    voting_open: false,
    created_at: "2026-08-01T08:00:00.000Z",
    ended_at: null,
    ...overrides,
  };
}

function makeTeams(): XYTeam[] {
  return [
    {
      id: "team-1",
      session_id: "session-1",
      team_number: 1,
      name: "ლურჯები",
      color: "#2563EB",
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "team-2",
      session_id: "session-1",
      team_number: 2,
      name: "მწვანეები",
      color: "#16A34A",
      created_at: "2026-08-01T08:00:00.000Z",
    },
  ];
}

function makeTeamVotes(): XYTeamVote[] {
  return [
    {
      id: "tv-1",
      session_id: "session-1",
      round_number: 1,
      team_id: "team-1",
      vote: "Y",
      points: 10,
      points_awarded: 10,
    },
    {
      id: "tv-2",
      session_id: "session-1",
      round_number: 2,
      team_id: "team-1",
      vote: "X",
      points: 5,
      points_awarded: 5,
    },
    {
      id: "tv-3",
      session_id: "session-1",
      round_number: 1,
      team_id: "team-2",
      vote: "X",
      points: 0,
      points_awarded: 0,
    },
    {
      id: "tv-4",
      session_id: "session-1",
      round_number: 2,
      team_id: "team-2",
      vote: "Y",
      points: -20,
      points_awarded: -20,
    },
  ];
}

describe("scoreboard privacy boundary", () => {
  it("excludes round-by-round decision and delta breakdowns from the view model", () => {
    const view = toScoreboardSafeView({
      session: makeSession(),
      teams: makeTeams(),
      teamVotes: makeTeamVotes(),
    });

    expect(view).not.toBeNull();
    expect(isScoreboardViewPrivate(view)).toBe(true);
    expect(findScoreboardPrivacyLeaks(view)).toEqual([]);

    expect(view).toMatchObject({
      sessionTitle: "XY თამაში — დღე 3",
      currentRound: 4,
      votingOpen: false,
    });

    // Totals only — team 1 is 10+5, team 2 is 0-20.
    expect(view?.standings).toEqual([
      {
        teamId: "team-1",
        teamNumber: 1,
        name: "ლურჯები",
        color: "#2563EB",
        totalPoints: 15,
      },
      {
        teamId: "team-2",
        teamNumber: 2,
        name: "მწვანეები",
        color: "#16A34A",
        totalPoints: -20,
      },
    ]);

    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/"roundVotes"/);
    expect(serialized).not.toMatch(/"roundPoints"/);
    expect(serialized).not.toMatch(/"teamVotes"/);
    expect(serialized).not.toMatch(/"R1"|"r1"/i);
    // Paper letters must not appear as decision values on the board payload.
    expect(serialized).not.toMatch(/"vote":"X"|"vote":"Y"/);
  });

  it("returns null when there is no active session", () => {
    expect(
      toScoreboardSafeView({
        session: null,
        teams: makeTeams(),
        teamVotes: makeTeamVotes(),
      })
    ).toBeNull();
  });

  it("flags a scoreboard payload that still carries round columns", () => {
    const leaked = {
      sessionTitle: "XY",
      currentRound: 2,
      votingOpen: true,
      rounds: [1, 2, 3],
      standings: [
        {
          teamId: "team-1",
          teamNumber: 1,
          name: "ლურჯები",
          color: "#2563EB",
          totalPoints: 10,
          roundPoints: { 1: 10, 2: -5 },
          r1: "Y",
        },
      ],
    };

    expect(isScoreboardViewPrivate(leaked)).toBe(false);
    expect(findScoreboardPrivacyLeaks(leaked)).toEqual(
      expect.arrayContaining([
        "rounds list must not appear on the scoreboard view",
        "standings[0] carries per-round point deltas",
        'standings[0] exposes round column "r1"',
      ])
    );
  });
});
