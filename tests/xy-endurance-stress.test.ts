import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { XY_POLL_INTERVAL_MS } from "@/hooks/useXyLiveSession";
import {
  XY_SESSION_STATUS_POLL_COLUMNS,
  applyXySessionStatusPoll,
} from "@/lib/supabase/xy-client";
import { balanceUnassignedPlayers } from "@/lib/xy/roster";
import {
  XY_DEFAULT_TEAMS,
  XY_TEAM_COUNT,
  computeStandings,
  computeXyAnalytics,
  parseXYVote,
  scoreRoundForTeams,
} from "@/lib/xy/scoring";
import {
  applyXyRoundState,
  isXySessionLive,
  xySessionStartPatch,
} from "@/lib/xy/session-state";
import type {
  XYIndividualVote,
  XYPlayer,
  XYSession,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";

const REPO_ROOT = path.resolve(__dirname, "..");
const ROUNDS = 15;
const PLAYERS = 38;
const TEAMS = XY_TEAM_COUNT;

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/**
 * In-memory mirror of a live XY session driven by the same helpers mentors
 * and analytics use in production — sized for a 1-hour / 15-round classroom.
 */
class XyEnduranceStore {
  session: XYSession;
  teams: XYTeam[] = [];
  players: XYPlayer[] = [];
  individualVotes: XYIndividualVote[] = [];
  teamVotes: XYTeamVote[] = [];

  private seq = 0;

  constructor() {
    this.session = {
      id: "xy-endurance-session",
      label: "XY Endurance — 15 რაუნდი",
      current_round: 1,
      voting_open: false,
      created_at: "2026-08-01T09:00:00.000Z",
      ...xySessionStartPatch(),
    };

    this.teams = XY_DEFAULT_TEAMS.map((team, index) => ({
      id: `team-${index + 1}`,
      session_id: this.session.id,
      team_number: index + 1,
      name: team.name,
      color: team.color,
      created_at: "2026-08-01T09:00:00.000Z",
    }));
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  joinPlayer(playerUid: string, fullName: string): XYPlayer {
    const player: XYPlayer = {
      id: this.nextId("player"),
      session_id: this.session.id,
      player_uid: playerUid,
      full_name: fullName,
      team_id: null,
      created_at: "2026-08-01T09:05:00.000Z",
    };
    this.players.push(player);
    return player;
  }

  assignTeam(playerId: string, teamId: string | null): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error("XY_PLAYER_NOT_FOUND");
    player.team_id = teamId;
  }

  /** Mirrors setXyRoundStateAction via the pure applyXyRoundState helper. */
  setRoundState(round: number, votingOpen: boolean): void {
    this.session = applyXyRoundState(this.session, { round, votingOpen });
  }

  castVote(playerUid: string, vote: XYVote): void {
    if (!isXySessionLive(this.session) || !this.session.voting_open) {
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
      return;
    }

    this.individualVotes.push({
      id: this.nextId("vote"),
      session_id: this.session.id,
      round_number: round,
      player_id: player.id,
      vote,
      edited_by_mentor: false,
    });
  }

  saveTeamRoundVotes(
    round: number,
    votes: { teamId: string; vote: string }[]
  ): void {
    const entries = votes.flatMap((entry) => {
      const parsed = parseXYVote(entry.vote);
      return parsed ? [{ teamId: entry.teamId, vote: parsed }] : [];
    });

    const { results } = scoreRoundForTeams(entries);
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
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

describe("XY 15-round / 38-player endurance stress", () => {
  const store = new XyEnduranceStore();

  it("seeds 38 players across 8 teams", () => {
    for (let i = 1; i <= PLAYERS; i += 1) {
      store.joinPlayer(`uid-${i}`, `სტუდენტი ${i}`);
    }

    for (const assignment of balanceUnassignedPlayers(store.players, store.teams)) {
      store.assignTeam(assignment.playerId, assignment.teamId);
    }

    expect(store.players).toHaveLength(PLAYERS);
    expect(store.teams).toHaveLength(TEAMS);
    expect(store.players.every((p) => p.team_id !== null)).toBe(true);
  });

  it("runs 15 full rounds with 570 phone votes and 120 paper votes", () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const openStart = performance.now();
      store.setRoundState(round, true);
      const openMs = performance.now() - openStart;
      expect(openMs).toBeLessThan(1);

      for (const player of store.players) {
        // Deterministic mix so analytics has both alignments to compute.
        const vote: XYVote =
          (player.player_uid.charCodeAt(4) + round) % 5 === 0 ? "X" : "Y";
        store.castVote(player.player_uid, vote);
      }

      const closeStart = performance.now();
      store.setRoundState(round, false);
      expect(performance.now() - closeStart).toBeLessThan(1);

      // Rotate a lone X around the 8 teams so scoring stays interesting.
      const defectIndex = (round - 1) % TEAMS;
      store.saveTeamRoundVotes(
        round,
        store.teams.map((team, index) => ({
          teamId: team.id,
          vote: index === defectIndex ? "X" : "Y",
        }))
      );
    }

    expect(store.individualVotes).toHaveLength(PLAYERS * ROUNDS);
    expect(store.teamVotes).toHaveLength(TEAMS * ROUNDS);
    expect(store.session.current_round).toBe(ROUNDS);
    expect(store.session.voting_open).toBe(false);

    const standings = computeStandings(store.teams, store.teamVotes);
    expect(standings).toHaveLength(TEAMS);
    expect(standings.every((s) => Number.isFinite(s.totalPoints))).toBe(true);
  });

  it("computeXyAnalytics finishes under 20ms without memory degradation", () => {
    const input = {
      players: store.players,
      teams: store.teams,
      individualVotes: store.individualVotes,
      teamVotes: store.teamVotes,
      currentRound: store.session.current_round,
    };

    // Warm the JIT / allocator so the timed passes reflect steady-state cost.
    for (let i = 0; i < 3; i += 1) {
      computeXyAnalytics(input);
    }

    const samples: number[] = [];
    let last = computeXyAnalytics(input);

    for (let i = 0; i < 10; i += 1) {
      const start = performance.now();
      last = computeXyAnalytics(input);
      samples.push(performance.now() - start);
    }

    expect(last.rounds).toEqual(
      Array.from({ length: ROUNDS }, (_, index) => index + 1)
    );
    expect(last.rows).toHaveLength(PLAYERS);
    expect(last.csv.length).toBeGreaterThan(0);

    // Capability bar: analytics for 570 phone votes stays sub-20ms once warm.
    expect(Math.min(...samples)).toBeLessThan(20);
    expect(median(samples)).toBeLessThan(20);

    const early = median(samples.slice(0, 3));
    const late = median(samples.slice(-3));
    // Later runs must not balloon — allow 3× noise, not progressive leak growth.
    expect(late).toBeLessThanOrEqual(Math.max(early * 3, 5));
  });

  it("CSV export covers all 15 rounds and 38 students without truncation", () => {
    const { csv, rows, rounds } = computeXyAnalytics({
      players: store.players,
      teams: store.teams,
      individualVotes: store.individualVotes,
      teamVotes: store.teamVotes,
      currentRound: ROUNDS,
    });

    expect(rounds).toHaveLength(ROUNDS);
    expect(rows).toHaveLength(PLAYERS);

    const lines = csv.split("\n");
    expect(lines).toHaveLength(PLAYERS + 1); // header + 38 students

    const header = lines[0]!;
    for (let round = 1; round <= ROUNDS; round += 1) {
      expect(header).toContain(`R${round} Phone`);
      expect(header).toContain(`R${round} Paper`);
      expect(header).toContain(`R${round} Flag`);
    }

    // Every student name lands in the export; trailing newline is optional.
    for (const player of store.players) {
      expect(csv).toContain(player.full_name);
    }

    expect(csv.endsWith("\n")).toBe(false);
    expect(csv.length).toBeGreaterThan(PLAYERS * ROUNDS);
    // No mid-string cut-off: last line still has the summary columns.
    const last = lines[lines.length - 1]!;
    expect(last.split(",").length).toBe(header.split(",").length);
  });
});

describe("XY realtime polling & leak guards", () => {
  const hook = readSource("src/hooks/useXyLiveSession.ts");
  const client = readSource("src/lib/supabase/xy-client.ts");

  it("polls once per second with status columns only", () => {
    expect(XY_POLL_INTERVAL_MS).toBe(1000);
    expect(hook).toContain("XY_POLL_INTERVAL_MS");
    expect(hook).toContain("pollSessionStatus");
    expect(hook).toContain("fetchXySessionStatusPoll");
    expect(hook).not.toMatch(
      /setInterval\(\(\) => \{\s*void refresh\(\);/
    );

    expect(XY_SESSION_STATUS_POLL_COLUMNS).toBe(
      "id, current_round, voting_open, status"
    );
    expect(client).toContain('select(XY_SESSION_STATUS_POLL_COLUMNS)');
    // Poll path must never ask for the heavy snapshot joins.
    expect(client).toMatch(
      /export async function fetchXySessionStatusPoll[\s\S]*?XY_SESSION_STATUS_POLL_COLUMNS/
    );
  });

  it("releases the poll timer and both Realtime channels on unmount", () => {
    expect(hook).toContain("return () => window.clearInterval(interval)");
    expect(hook.match(/removeChannel\(channel\)/g)?.length).toBeGreaterThanOrEqual(
      2
    );
    expect(hook).toContain("xy-live-session-${sessionId}");
  });

  it("applyXySessionStatusPoll patches round/voting without a full refresh", () => {
    const session: XYSession = {
      id: "s1",
      label: "XY",
      is_active: true,
      status: "active",
      current_round: 3,
      voting_open: false,
      created_at: "2026-08-01T09:00:00.000Z",
      ended_at: null,
    };

    const patched = applyXySessionStatusPoll(session, {
      id: "s1",
      current_round: 4,
      voting_open: true,
      status: "active",
    });

    expect(patched).toMatchObject({
      id: "s1",
      current_round: 4,
      voting_open: true,
      status: "active",
      is_active: true,
    });
    expect(applyXySessionStatusPoll(session, {
      id: "s1",
      current_round: 3,
      voting_open: false,
      status: "active",
    })).toBe("unchanged");
    expect(
      applyXySessionStatusPoll(session, {
        id: "s1",
        current_round: 3,
        voting_open: false,
        status: "completed",
      })
    ).toBe("refresh");
    expect(applyXySessionStatusPoll(session, null)).toBe("refresh");
  });
});
