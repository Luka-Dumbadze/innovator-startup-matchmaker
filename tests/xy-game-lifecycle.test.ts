import { describe, expect, it } from "vitest";

import { balanceUnassignedPlayers } from "@/lib/xy/roster";
import {
  isXySessionLive,
  xySessionEndPatch,
  xySessionStartPatch,
} from "@/lib/xy/session-state";
import {
  XY_DEFAULT_TEAMS,
  buildAnalyticsCsv,
  buildAnalyticsRows,
  computeStandings,
  computeSubmissionProgress,
  parseXYVote,
  resolveRoundNumbers,
  scoreRoundForTeams,
} from "@/lib/xy/scoring";
import type {
  XYIndividualVote,
  XYPlayer,
  XYSession,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";

/**
 * In-memory mirror of the XY server contract:
 * - `xy_join_player` / `xy_cast_individual_vote` (SECURITY DEFINER RPCs)
 * - `setXyRoundStateAction` / `saveXyTeamRoundVotesAction` /
 *   `overrideXyIndividualVoteAction` (mentor server actions)
 *
 * The scoring itself comes from the real production helpers.
 */
class XyGameStore {
  session: XYSession;
  teams: XYTeam[] = [];
  players: XYPlayer[] = [];
  individualVotes: XYIndividualVote[] = [];
  teamVotes: XYTeamVote[] = [];

  private seq = 0;

  constructor(label: string) {
    this.session = {
      id: "xy-session-1",
      label,
      current_round: 1,
      voting_open: false,
      created_at: "2026-07-31T09:00:00.000Z",
      ...xySessionStartPatch(),
    };

    this.teams = XY_DEFAULT_TEAMS.map((team, index) => ({
      id: `team-${index + 1}`,
      session_id: this.session.id,
      team_number: index + 1,
      name: team.name,
      color: team.color,
      created_at: "2026-07-31T09:00:00.000Z",
    }));
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  /** Mirrors xy_join_player: idempotent on (session_id, player_uid). */
  joinPlayer(playerUid: string, fullName: string): XYPlayer {
    if (!isXySessionLive(this.session)) {
      throw new Error("XY_SESSION_NOT_ACTIVE");
    }

    const name = fullName.trim();
    if (!name) throw new Error("FULL_NAME_REQUIRED");

    const existing = this.players.find((p) => p.player_uid === playerUid);
    if (existing) {
      existing.full_name = name;
      return existing;
    }

    const player: XYPlayer = {
      id: this.nextId("player"),
      session_id: this.session.id,
      player_uid: playerUid,
      full_name: name,
      team_id: null,
      created_at: "2026-07-31T09:05:00.000Z",
    };
    this.players.push(player);
    return player;
  }

  /** Mirrors setXyRoundStateAction: only a live session can drive rounds. */
  setRoundState(round: number, votingOpen: boolean): void {
    if (!isXySessionLive(this.session)) {
      throw new Error("XY_SESSION_NOT_ACTIVE");
    }
    this.session.current_round = round;
    this.session.voting_open = votingOpen;
  }

  /** Mirrors endXySessionAction: both liveness flags move together. */
  endSession(): void {
    this.session = { ...this.session, voting_open: false, ...xySessionEndPatch() };
  }

  /** Mirrors xy_cast_individual_vote: needs a live session and an open round. */
  castVote(playerUid: string, vote: XYVote): XYIndividualVote {
    if (!isXySessionLive(this.session)) {
      throw new Error("XY_SESSION_NOT_ACTIVE");
    }

    if (!this.session.voting_open) {
      throw new Error("XY_VOTING_CLOSED");
    }

    const player = this.players.find((p) => p.player_uid === playerUid);
    if (!player) throw new Error("XY_PLAYER_NOT_FOUND");

    const round = this.session.current_round;
    const existing = this.individualVotes.find(
      (v) => v.player_id === player.id && v.round_number === round
    );

    if (existing) {
      existing.vote = vote;
      existing.edited_by_mentor = false;
      return existing;
    }

    const row: XYIndividualVote = {
      id: this.nextId("vote"),
      session_id: this.session.id,
      round_number: round,
      player_id: player.id,
      vote,
      edited_by_mentor: false,
    };
    this.individualVotes.push(row);
    return row;
  }

  assignTeam(playerId: string, teamId: string | null): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error("XY_PLAYER_NOT_FOUND");
    player.team_id = teamId;
  }

  /** Mirrors saveXyTeamRoundVotesAction: re-scores the entire round. */
  saveTeamRoundVotes(
    round: number,
    votes: { teamId: string; vote: string | null }[]
  ): { scored: number; complete: boolean } {
    const entries: { teamId: string; vote: XYVote }[] = [];
    const cleared: string[] = [];

    for (const entry of votes) {
      const parsed = parseXYVote(entry.vote);
      if (parsed) entries.push({ teamId: entry.teamId, vote: parsed });
      else cleared.push(entry.teamId);
    }

    this.teamVotes = this.teamVotes.filter(
      (v) => !(v.round_number === round && cleared.includes(v.team_id))
    );

    const { round: score, results } = scoreRoundForTeams(entries);

    for (const result of results) {
      const existing = this.teamVotes.find(
        (v) => v.round_number === round && v.team_id === result.teamId
      );
      if (existing) {
        existing.vote = result.vote;
        existing.points = result.points;
        existing.points_awarded = result.points;
      } else {
        this.teamVotes.push({
          id: this.nextId("team-vote"),
          session_id: this.session.id,
          round_number: round,
          team_id: result.teamId,
          vote: result.vote,
          points: result.points,
          points_awarded: result.points,
        });
      }
    }

    return { scored: results.length, complete: score.complete };
  }

  /** Mirrors overrideXyIndividualVoteAction, including past closed rounds. */
  overrideIndividualVote(
    round: number,
    playerId: string,
    vote: string | null
  ): void {
    const parsed = parseXYVote(vote);

    if (!parsed) {
      this.individualVotes = this.individualVotes.filter(
        (v) => !(v.round_number === round && v.player_id === playerId)
      );
      return;
    }

    const existing = this.individualVotes.find(
      (v) => v.round_number === round && v.player_id === playerId
    );

    if (existing) {
      existing.vote = parsed;
      existing.edited_by_mentor = true;
      return;
    }

    this.individualVotes.push({
      id: this.nextId("vote"),
      session_id: this.session.id,
      round_number: round,
      player_id: playerId,
      vote: parsed,
      edited_by_mentor: true,
    });
  }

  /** Team paper decisions for one round in team order. */
  paperVotes(round: number): (XYVote | null)[] {
    return this.teams.map(
      (team) =>
        this.teamVotes.find(
          (v) => v.round_number === round && v.team_id === team.id
        )?.vote ?? null
    );
  }

  playersOfTeam(teamId: string): XYPlayer[] {
    return this.players.filter((p) => p.team_id === teamId);
  }
}

describe("XY game full lifecycle", () => {
  const store = new XyGameStore("XY თამაში — დღე 3");

  it("phase 1 · mentor session starts live with 8 named teams and voting closed", () => {
    expect(store.session.is_active).toBe(true);
    expect(store.session.status).toBe("active");
    expect(isXySessionLive(store.session)).toBe(true);
    expect(store.teams).toHaveLength(8);
    expect(store.teams.map((t) => t.name)).toContain("ლურჯები");
    expect(store.teams.map((t) => t.name)).toContain("მწვანეები");
    expect(store.session.voting_open).toBe(false);
    expect(store.session.current_round).toBe(1);
  });

  it("phase 2 · 40 students join by name only, re-joins stay idempotent", () => {
    for (let i = 1; i <= 40; i += 1) {
      store.joinPlayer(`uid-${i}`, `სტუდენტი ${i}`);
    }
    // A phone reload re-sends the same uid.
    store.joinPlayer("uid-1", "სტუდენტი 1");

    expect(store.players).toHaveLength(40);
    expect(store.players.every((p) => p.team_id === null)).toBe(true);
  });

  it("phase 3 · mentor assignment fills all 8 teams with 5 students each", () => {
    for (const assignment of balanceUnassignedPlayers(store.players, store.teams)) {
      store.assignTeam(assignment.playerId, assignment.teamId);
    }

    for (const team of store.teams) {
      expect(store.playersOfTeam(team.id)).toHaveLength(5);
    }
  });

  it("phase 4 · phones cannot vote before the mentor opens the round", () => {
    expect(() => store.castVote("uid-1", "Y")).toThrow(/XY_VOTING_CLOSED/);
    expect(store.individualVotes).toHaveLength(0);
  });

  it("phase 5 · round 1 opens, 38 of 40 phones report in", () => {
    store.setRoundState(1, true);

    // Team 1's five members secretly defect; everyone else cooperates.
    const stealthTeam = store.teams[0]!;
    const stealthUids = new Set(
      store.playersOfTeam(stealthTeam.id).map((p) => p.player_uid)
    );

    for (const player of store.players.slice(0, 38)) {
      store.castVote(player.player_uid, stealthUids.has(player.player_uid) ? "X" : "Y");
    }

    const progress = computeSubmissionProgress(
      store.players,
      store.individualVotes,
      1
    );
    expect(progress.label).toBe("38 / 40 სტუდენტმა მისცა ხმა");
    expect(progress.pending).toHaveLength(2);
  });

  it("phase 6 · a student can change their tap while the round is open", () => {
    store.castVote("uid-1", "Y");
    store.castVote("uid-1", "X");

    const votes = store.individualVotes.filter(
      (v) => v.round_number === 1 && v.player_id === store.players[0]!.id
    );
    expect(votes).toHaveLength(1);
    expect(votes[0]?.vote).toBe("X");
  });

  it("phase 7 · closing the round locks further phone writes", () => {
    store.setRoundState(1, false);
    expect(() => store.castVote("uid-2", "X")).toThrow(/XY_VOTING_CLOSED/);
  });

  it("phase 8 · partial paper entry scores nothing until all 8 are in", () => {
    const partial = store.teams.slice(0, 5).map((team) => ({
      teamId: team.id,
      vote: "Y" as string | null,
    }));

    const result = store.saveTeamRoundVotes(1, partial);
    expect(result).toEqual({ scored: 5, complete: false });
    expect(store.teamVotes.every((v) => v.points === 0)).toBe(true);
  });

  it("phase 9 · completing round 1 as 7Y/1X pays the defector and punishes the rest", () => {
    const votes = store.teams.map((team, index) => ({
      teamId: team.id,
      vote: index === 7 ? "X" : "Y",
    }));

    const result = store.saveTeamRoundVotes(1, votes);
    expect(result).toEqual({ scored: 8, complete: true });

    const standings = computeStandings(store.teams, store.teamVotes);
    expect(standings[0]?.team.team_number).toBe(8);
    expect(standings[0]?.totalPoints).toBe(15);
    expect(standings.slice(1).every((s) => s.totalPoints === -25)).toBe(true);
  });

  it("phase 10 · round 2 runs to a full 8Y cooperation payout", () => {
    store.setRoundState(2, true);
    for (const player of store.players) {
      store.castVote(player.player_uid, "Y");
    }
    store.setRoundState(2, false);

    store.saveTeamRoundVotes(
      2,
      store.teams.map((team) => ({ teamId: team.id, vote: "Y" }))
    );

    const standings = computeStandings(store.teams, store.teamVotes);
    const team8 = standings.find((s) => s.team.team_number === 8);
    expect(team8?.totalPoints).toBe(25);
    expect(standings.find((s) => s.team.team_number === 1)?.totalPoints).toBe(-15);
    expect(
      computeSubmissionProgress(store.players, store.individualVotes, 2).submitted
    ).toBe(40);
  });

  it("phase 11 · editing one past paper vote re-scores that whole round", () => {
    // Mentor discovers team 7 also handed in an X for round 1 → 6Y/2X.
    const corrected = store.teams.map((team, index) => ({
      teamId: team.id,
      vote: index >= 6 ? "X" : "Y",
    }));
    store.saveTeamRoundVotes(1, corrected);

    const round1 = store.teamVotes.filter((v) => v.round_number === 1);
    expect(round1.filter((v) => v.vote === "X")).toHaveLength(2);
    expect(round1.filter((v) => v.vote === "Y").every((v) => v.points === -20)).toBe(
      true
    );
    expect(round1.filter((v) => v.vote === "X").every((v) => v.points === 10)).toBe(
      true
    );

    // Round 2 payouts are untouched by the round 1 correction.
    expect(
      store.teamVotes
        .filter((v) => v.round_number === 2)
        .every((v) => v.points === 10)
    ).toBe(true);

    const standings = computeStandings(store.teams, store.teamVotes);
    expect(standings[0]?.totalPoints).toBe(20);
    expect(standings.at(-1)?.totalPoints).toBe(-10);
  });

  it("phase 12 · mentor can backfill and clear phone votes for a closed round", () => {
    const missing = computeSubmissionProgress(
      store.players,
      store.individualVotes,
      1
    ).pending;
    expect(missing).toHaveLength(2);

    store.overrideIndividualVote(1, missing[0]!.id, "Y");
    store.overrideIndividualVote(1, missing[1]!.id, "x");

    const backfilled = store.individualVotes.filter(
      (v) => v.round_number === 1 && v.edited_by_mentor
    );
    expect(backfilled).toHaveLength(2);
    expect(backfilled.map((v) => v.vote).sort()).toEqual(["X", "Y"]);
    expect(
      computeSubmissionProgress(store.players, store.individualVotes, 1).submitted
    ).toBe(40);

    store.overrideIndividualVote(1, missing[1]!.id, null);
    expect(
      computeSubmissionProgress(store.players, store.individualVotes, 1).submitted
    ).toBe(39);
    store.overrideIndividualVote(1, missing[1]!.id, "X");
  });

  it("phase 13 · analytics flags stealth defectors and secret altruists per round", () => {
    const rounds = resolveRoundNumbers(
      store.individualVotes,
      store.teamVotes,
      store.session.current_round
    );
    expect(rounds).toEqual([1, 2]);

    const rows = buildAnalyticsRows({
      players: store.players,
      teams: store.teams,
      individualVotes: store.individualVotes,
      teamVotes: store.teamVotes,
      rounds,
    });

    expect(rows).toHaveLength(40);

    // Team 1 said Y on paper for round 1 but all five phones said X.
    const team1Rows = rows.filter((r) => r.teamNumber === 1);
    expect(team1Rows).toHaveLength(5);
    expect(team1Rows.every((r) => r.cells[0]?.alignment === "stealth_defector")).toBe(
      true
    );

    // Teams 7 and 8 handed in X yet their phones said Y in round 1.
    const defectorTeamRows = rows.filter(
      (r) => r.teamNumber === 7 || r.teamNumber === 8
    );
    const altruists = defectorTeamRows.filter(
      (r) => r.cells[0]?.alignment === "secret_altruist"
    );
    expect(altruists.length).toBeGreaterThan(0);

    // Round 2 was unanimous cooperation on both channels.
    expect(rows.every((r) => r.cells[1]?.alignment === "aligned")).toBe(true);

    const totalStealth = rows.reduce((sum, r) => sum + r.stealthDefections, 0);
    expect(totalStealth).toBe(5);
  });

  it("phase 14 · CSV export carries every student, round and flag", () => {
    const rounds = resolveRoundNumbers(
      store.individualVotes,
      store.teamVotes,
      store.session.current_round
    );
    const rows = buildAnalyticsRows({
      players: store.players,
      teams: store.teams,
      individualVotes: store.individualVotes,
      teamVotes: store.teamVotes,
      rounds,
    });

    const csv = buildAnalyticsCsv(rows, rounds);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(41);
    expect(lines[0]).toBe(
      [
        "Student Name",
        "Team Number",
        "Team Name",
        "R1 Phone",
        "R1 Paper",
        "R1 Flag",
        "R2 Phone",
        "R2 Paper",
        "R2 Flag",
        "Stealth Defections",
        "Secret Altruism",
      ].join(",")
    );

    expect(csv).toContain("🚨 Stealth Defector");
    expect(csv).toContain("💚 Secret Altruist");
    for (const player of store.players) {
      expect(csv).toContain(player.full_name);
    }
  });

  it("phase 15 · scoreboard exposes team totals only, never phone votes", () => {
    const standings = computeStandings(store.teams, store.teamVotes);
    const serialized = JSON.stringify(standings);

    expect(standings).toHaveLength(8);
    for (const vote of store.individualVotes) {
      expect(serialized).not.toContain(vote.id);
      expect(serialized).not.toContain(vote.player_id);
    }
  });

  it("phase 16 · ending the session retires both liveness flags and locks the game", () => {
    store.endSession();

    expect(store.session.is_active).toBe(false);
    expect(store.session.status).toBe("completed");
    expect(store.session.ended_at).not.toBeNull();
    expect(isXySessionLive(store.session)).toBe(false);
    expect(store.session.voting_open).toBe(false);

    expect(() => store.joinPlayer("uid-late", "გვიანი სტუდენტი")).toThrow(
      /XY_SESSION_NOT_ACTIVE/
    );
    expect(() => store.castVote("uid-1", "Y")).toThrow(/XY_SESSION_NOT_ACTIVE/);
    expect(() => store.setRoundState(3, true)).toThrow(/XY_SESSION_NOT_ACTIVE/);
    expect(store.players).toHaveLength(40);
  });

  it("phase 17 · a retired session stays editable for grading and export", () => {
    const before = computeStandings(store.teams, store.teamVotes)[0]?.totalPoints;

    store.saveTeamRoundVotes(
      2,
      store.teams.map((team, index) => ({ teamId: team.id, vote: index === 0 ? "X" : "Y" }))
    );

    const after = computeStandings(store.teams, store.teamVotes);
    expect(after[0]?.totalPoints).not.toBe(before);
    expect(
      store.teamVotes.filter((v) => v.round_number === 2 && v.vote === "X")
    ).toHaveLength(1);

    store.overrideIndividualVote(2, store.players[0]!.id, "X");
    expect(
      store.individualVotes.find(
        (v) => v.round_number === 2 && v.player_id === store.players[0]!.id
      )
    ).toMatchObject({ vote: "X", edited_by_mentor: true });
  });
});
