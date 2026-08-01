import { describe, expect, it } from "vitest";

import {
  computePublicStandings,
  findStudentPrivacyLeaks,
  isStudentViewPrivate,
  toStudentSafeView,
} from "@/lib/xy/student-privacy";
import type {
  XYIndividualVote,
  XYPlayer,
  XYSession,
  XYTeam,
  XYTeamVote,
} from "@/types/xy";

function makeSession(): XYSession {
  return {
    id: "session-1",
    label: "XY თამაში",
    is_active: true,
    status: "active",
    current_round: 2,
    voting_open: true,
    created_at: "2026-08-01T08:00:00.000Z",
    ended_at: null,
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

function makePlayers(): XYPlayer[] {
  return [
    {
      id: "player-1",
      session_id: "session-1",
      player_uid: "uid-self",
      full_name: "ნინო ბერიძე",
      real_name: "ნინო ბერიძე",
      team_id: "team-1",
      team_number: 1,
      created_at: "2026-08-01T08:01:00.000Z",
    },
    {
      id: "player-2",
      session_id: "session-1",
      player_uid: "uid-other",
      full_name: "ლუკა კაპანაძე",
      real_name: "ლუკა კაპანაძე",
      team_id: "team-2",
      team_number: 2,
      created_at: "2026-08-01T08:01:01.000Z",
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
      team_number: 1,
      team_name: "ლურჯები",
      vote: "Y",
      points: 10,
      points_awarded: 10,
    },
    {
      id: "tv-2",
      session_id: "session-1",
      round_number: 1,
      team_id: "team-2",
      team_number: 2,
      team_name: "მწვანეები",
      vote: "X",
      points: 0,
      points_awarded: 0,
    },
    {
      id: "tv-3",
      session_id: "session-1",
      round_number: 2,
      team_id: "team-1",
      team_number: 1,
      team_name: "ლურჯები",
      vote: "X",
      points: 5,
      points_awarded: 5,
    },
  ];
}

function makeIndividualVotes(): XYIndividualVote[] {
  return [
    {
      id: "iv-1",
      session_id: "session-1",
      round_number: 2,
      player_id: "player-1",
      vote: "Y",
      edited_by_mentor: false,
      edited_at: null,
    },
    {
      id: "iv-2",
      session_id: "session-1",
      round_number: 2,
      player_id: "player-2",
      vote: "X",
      edited_by_mentor: false,
      edited_at: null,
    },
  ];
}

describe("student privacy boundary", () => {
  const snapshot = {
    session: makeSession(),
    teams: makeTeams(),
    players: makePlayers(),
    individualVotes: makeIndividualVotes(),
    teamVotes: makeTeamVotes(),
  };

  it("never leaks round-by-round team decision arrays through the safe view", () => {
    const view = toStudentSafeView(snapshot, "uid-self");

    expect(isStudentViewPrivate(view)).toBe(true);
    expect(findStudentPrivacyLeaks(view)).toEqual([]);

    // Serialize like a mobile payload and re-check — no X/Y decision maps.
    const serialized = JSON.parse(JSON.stringify(view)) as unknown;
    expect(findStudentPrivacyLeaks(serialized)).toEqual([]);
    expect(JSON.stringify(serialized)).not.toMatch(/"roundVotes"/);
    expect(JSON.stringify(serialized)).not.toMatch(/"teamVotes"/);
  });

  it("exposes only the student's own phone vote for the active round", () => {
    const view = toStudentSafeView(snapshot, "uid-self");

    expect(view.me?.player_uid).toBe("uid-self");
    expect(view.myVoteForRound).toBe("Y");
    // Other players exist in the raw snapshot but not as a list on the safe view.
    expect(view).not.toHaveProperty("players");
    expect(view).not.toHaveProperty("individualVotes");
  });

  it("publishes cumulative totals without per-round paper votes", () => {
    const standings = computePublicStandings(snapshot.teams, snapshot.teamVotes);

    expect(standings).toEqual([
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
        totalPoints: 0,
      },
    ]);

    for (const row of standings) {
      expect(row).not.toHaveProperty("roundVotes");
      expect(row).not.toHaveProperty("vote");
    }
  });

  it("flags a payload that still carries team decision history", () => {
    const leaked = {
      ...toStudentSafeView(snapshot, "uid-self"),
      teamVotes: makeTeamVotes(),
    };

    expect(isStudentViewPrivate(leaked)).toBe(false);
    expect(findStudentPrivacyLeaks(leaked)).toContain(
      "teamVotes array must not appear on the student view"
    );
  });

  it("flags standings rows that embed per-round X/Y maps", () => {
    const leaked = {
      session: null,
      me: null,
      myVoteForRound: null,
      standings: [
        {
          teamId: "team-1",
          teamNumber: 1,
          name: "ლურჯები",
          color: "#2563EB",
          totalPoints: 10,
          roundVotes: { 1: "Y", 2: "X" },
        },
      ],
    };

    expect(findStudentPrivacyLeaks(leaked)).toEqual(
      expect.arrayContaining([
        "standings[0] carries round-by-round team decisions",
        "standings[0].roundVotes embeds per-round X/Y decisions",
      ])
    );
  });
});
