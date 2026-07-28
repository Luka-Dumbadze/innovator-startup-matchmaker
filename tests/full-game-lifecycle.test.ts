/**
 * End-to-end Full Game Lifecycle Simulation
 *
 * Programmatically walks an entire 40-player Startup Matchmaker session
 * through admin setup → waterfilling join → solo/team brainstorm → pitch
 * selection + re-roll → mentor voting → session complete + CSV export.
 *
 * Uses real domain helpers (presets, pitch selector, idea notes, vote storage)
 * with an in-memory store that mirrors Supabase waterfilling / voting rules.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { generateRandomPresets } from "@/lib/constants/preset-words";
import {
  MODE_SECONDS,
  resolvePitcher,
  selectAllPitchTeamsSequentially,
  selectNextPitchTeam,
  type PitchRosterMember,
} from "@/lib/timer/session-timer";
import {
  clampIdeaField,
  formatPitchSummary,
  getIdeaNotes,
  getStoredPitchVote,
  markPitchSubmitted,
  saveIdeaNotes,
  saveStoredPitchVote,
  teamIdeasChannelName,
} from "@/lib/utils/player-storage";
import type {
  DailySession,
  IdeaNotes,
  PlayerAssignment,
  SharedTeamIdea,
  SubmittedIdea,
  Team,
} from "@/types/game";

// ---------------------------------------------------------------------------
// Simulation helpers (mirror DB RPCs / waterfilling / voting / CSV)
// ---------------------------------------------------------------------------

type SimPlayer = {
  playerUid: string;
  realName: string;
  nickname: string;
  teamId: string | null;
  draft: IdeaNotes | null;
};

type PitchVote = {
  sessionId: string;
  teamId: string;
  voterUid: string;
  voteType: "like" | "dislike";
};

type PhaseReport = {
  name: string;
  passed: boolean;
  detail: string;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** In-memory waterfilling: seat on a random open team among those with MIN(current_count). */
function assignPlayerWaterfill(
  teams: Team[],
  assignments: PlayerAssignment[],
  sessionId: string,
  player: { playerUid: string; realName: string; nickname: string },
  random: () => number = Math.random,
): Team {
  const existing = assignments.find(
    (a) => a.session_id === sessionId && a.player_uid === player.playerUid,
  );
  if (existing) {
    const team = teams.find((t) => t.id === existing.team_id);
    if (!team) throw new Error("EXISTING_ASSIGNMENT_TEAM_MISSING");
    existing.real_name = player.realName;
    existing.nickname = player.nickname;
    return team;
  }

  const open = teams.filter((t) => t.current_count < t.max_capacity);
  if (open.length === 0) {
    throw new Error("SESSION_FULL: all teams are at capacity (40/40)");
  }

  const minCount = Math.min(...open.map((t) => t.current_count));
  const candidates = open.filter((t) => t.current_count === minCount);
  const chosen = candidates[Math.floor(random() * candidates.length)]!;

  chosen.current_count += 1;
  assignments.push({
    id: crypto.randomUUID(),
    session_id: sessionId,
    team_id: chosen.id,
    player_uid: player.playerUid,
    real_name: player.realName,
    nickname: player.nickname,
    joined_at: new Date().toISOString(),
  });

  return chosen;
}

/** Mirror cast_pitch_vote: upsert vote + recount likes/dislikes on final pitch. */
function castPitchVoteSim(
  votes: PitchVote[],
  ideas: SubmittedIdea[],
  input: {
    sessionId: string;
    teamId: string;
    voterUid: string;
    voteType: "like" | "dislike";
    voterTeamId: string;
  },
): { likes_count: number; dislikes_count: number; vote_type: "like" | "dislike" } {
  if (input.voterTeamId === input.teamId) {
    throw new Error("OWN_TEAM_VOTE_BLOCKED: pitching team cannot vote on itself");
  }

  const idx = votes.findIndex(
    (v) =>
      v.sessionId === input.sessionId &&
      v.teamId === input.teamId &&
      v.voterUid === input.voterUid,
  );
  if (idx >= 0) {
    votes[idx]!.voteType = input.voteType;
  } else {
    votes.push({
      sessionId: input.sessionId,
      teamId: input.teamId,
      voterUid: input.voterUid,
      voteType: input.voteType,
    });
  }

  const teamVotes = votes.filter(
    (v) => v.sessionId === input.sessionId && v.teamId === input.teamId,
  );
  const likes = teamVotes.filter((v) => v.voteType === "like").length;
  const dislikes = teamVotes.filter((v) => v.voteType === "dislike").length;

  for (const idea of ideas) {
    if (
      idea.session_id === input.sessionId &&
      idea.team_id === input.teamId &&
      idea.is_final_team_pitch
    ) {
      idea.likes_count = likes;
      idea.dislikes_count = dislikes;
    }
  }

  return { likes_count: likes, dislikes_count: dislikes, vote_type: input.voteType };
}

/** Same header/shape as admin `exportSessionCSV`, plus one row per player idea. */
function buildSessionCsv(input: {
  teams: Team[];
  assignments: PlayerAssignment[];
  ideas: SubmittedIdea[];
}): string {
  const header = [
    "Team Number",
    "Team Name",
    "Global Challenge",
    "Tools",
    "Player Real Name",
    "Nickname",
    "Startup Title",
    "Solution",
    "Tools Integration",
    "Is Final Pitch",
    "Likes",
    "Dislikes",
    "Submission Timestamp",
  ];

  const rows: string[][] = [];
  for (const team of input.teams) {
    const tools = team.words.join(" · ");
    const teamIdeas = input.ideas.filter((i) => i.team_id === team.id);
    for (const idea of teamIdeas) {
      rows.push([
        String(team.team_number),
        team.name,
        team.domain,
        tools,
        idea.author_real_name || "—",
        idea.author_nickname || "—",
        idea.startup_name,
        idea.one_sentence_solution,
        idea.tools_integration,
        idea.is_final_team_pitch ? "yes" : "no",
        String(idea.likes_count),
        String(idea.dislikes_count),
        idea.created_at,
      ]);
    }
  }

  return [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join(
    "\n",
  );
}

function aggregateTeamHubByNickname(
  drafts: SharedTeamIdea[],
): Record<string, SharedTeamIdea> {
  const byNickname: Record<string, SharedTeamIdea> = {};
  for (const draft of drafts) {
    byNickname[draft.nickname] = draft;
  }
  return byNickname;
}

// ---------------------------------------------------------------------------
// Full lifecycle
// ---------------------------------------------------------------------------

describe("Full Game Lifecycle Simulation (40 players)", () => {
  const phaseReports: PhaseReport[] = [];

  beforeEach(() => {
    window.localStorage.clear();
    phaseReports.length = 0;
  });

  it("runs the complete match from session create → CSV export", () => {
    // =====================================================================
    // Phase 1 — Admin creates & activates session with 8 preset teams
    // =====================================================================
    const presets = generateRandomPresets();
    expect(presets).toHaveLength(8);

    const sessionId = crypto.randomUUID();
    const session: DailySession = {
      id: sessionId,
      date_label: "Lifecycle Sim Day",
      is_active: true,
      created_at: new Date().toISOString(),
      ended_at: null,
      voting_open: false,
      voting_team_id: null,
    };

    const teams: Team[] = presets.map((p) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      team_number: p.teamNumber,
      name: p.name,
      color: p.color,
      domain: p.domain,
      words: [...p.words],
      max_capacity: 5,
      current_count: 0,
    }));

    expect(new Set(teams.map((t) => t.domain)).size).toBe(8);
    expect(teams.every((t) => t.words.length === 3)).toBe(true);
    expect(MODE_SECONDS.solo_brainstorm).toBe(120);
    expect(MODE_SECONDS.team_brainstorm).toBe(600);
    expect(MODE_SECONDS.pitch).toBe(60);

    phaseReports.push({
      name: "Phase 1 · Admin session + 8 presets",
      passed: true,
      detail: `Session ${sessionId.slice(0, 8)}… active with ${teams.length} teams`,
    });

    // =====================================================================
    // Phase 2 — 40 players join via waterfilling (5 per team)
    // =====================================================================
    const assignments: PlayerAssignment[] = [];
    const players: SimPlayer[] = [];

    // Deterministic-ish shuffle seed for stable waterfilling coverage
    let seed = 42;
    const seededRandom = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let i = 1; i <= 40; i += 1) {
      const playerUid = crypto.randomUUID();
      const realName = `Student ${i}`;
      const nickname = `Nick ${i}`;
      const team = assignPlayerWaterfill(
        teams,
        assignments,
        sessionId,
        { playerUid, realName, nickname },
        seededRandom,
      );
      players.push({
        playerUid,
        realName,
        nickname,
        teamId: team.id,
        draft: null,
      });
    }

    expect(assignments).toHaveLength(40);
    expect(players).toHaveLength(40);
    expect(teams.every((t) => t.current_count === 5)).toBe(true);
    expect(teams.reduce((sum, t) => sum + t.current_count, 0)).toBe(40);

    // 41st join must fail (session full)
    expect(() =>
      assignPlayerWaterfill(
        teams,
        assignments,
        sessionId,
        {
          playerUid: crypto.randomUUID(),
          realName: "Overflow Student",
          nickname: "OverflowNick",
        },
        seededRandom,
      ),
    ).toThrow(/SESSION_FULL/);

    phaseReports.push({
      name: "Phase 2 · Waterfilling join (40 → 8×5)",
      passed: true,
      detail: teams.map((t) => `T${t.team_number}:${t.current_count}`).join(" "),
    });

    // =====================================================================
    // Phase 3 — Solo 2-minute brainstorm (local draft notes)
    // =====================================================================
    for (const player of players) {
      const team = teams.find((t) => t.id === player.teamId)!;
      const draft: IdeaNotes = {
        startupName: clampIdeaField(`${player.nickname} Co`),
        oneSentenceSolution: clampIdeaField(
          `${player.realName} solves ${team.domain} with a simple product`,
        ),
        toolsIntegration: clampIdeaField(
          `Uses ${team.words[0]}, ${team.words[1]}, and ${team.words[2]}`,
        ),
      };
      player.draft = draft;

      // Exercise real localStorage helpers for this player's "device" session key.
      // (One browser = one notes key; we verify shape via save/load round-trip.)
      saveIdeaNotes(sessionId, draft);
      expect(getIdeaNotes(sessionId)).toEqual(draft);

      const summary = formatPitchSummary(draft, team.domain, team.words);
      expect(summary).toContain(draft.startupName);
      expect(summary).toContain(team.domain);
    }

    expect(players.every((p) => p.draft !== null)).toBe(true);

    phaseReports.push({
      name: "Phase 3 · Solo brainstorm drafts",
      passed: true,
      detail: `40/40 students filled Title + Solution + Tools (${MODE_SECONDS.solo_brainstorm}s window)`,
    });

    // =====================================================================
    // Phase 4 — Team brainstorm hub + final pitch submission
    // =====================================================================
    const ideas: SubmittedIdea[] = [];
    const hubByTeam = new Map<string, Record<string, SharedTeamIdea>>();

    for (const team of teams) {
      const roster = players.filter((p) => p.teamId === team.id);
      expect(roster).toHaveLength(5);

      const channel = teamIdeasChannelName(sessionId, team.id);
      expect(channel).toBe(`team-ideas-${sessionId}-${team.id}`);

      const shared: SharedTeamIdea[] = roster.map((p) => ({
        playerUid: p.playerUid,
        nickname: p.nickname,
        startupName: p.draft!.startupName,
        oneSentenceSolution: p.draft!.oneSentenceSolution,
        toolsIntegration: p.draft!.toolsIntegration,
        updatedAt: new Date().toISOString(),
      }));

      const hub = aggregateTeamHubByNickname(shared);
      hubByTeam.set(team.id, hub);

      // TeamIdeaHub aggregates by nickname — all 5 visible
      expect(Object.keys(hub)).toHaveLength(5);
      for (const p of roster) {
        expect(hub[p.nickname]?.startupName).toBe(p.draft!.startupName);
      }

      // Individual idea rows (so CSV includes all 40 student names)
      for (const p of roster) {
        ideas.push({
          id: crypto.randomUUID(),
          session_id: sessionId,
          team_id: team.id,
          author_player_uid: p.playerUid,
          author_real_name: p.realName,
          author_nickname: p.nickname,
          startup_name: p.draft!.startupName,
          one_sentence_solution: p.draft!.oneSentenceSolution,
          tools_integration: p.draft!.toolsIntegration,
          is_final_team_pitch: false,
          likes_count: 0,
          dislikes_count: 0,
          created_at: new Date().toISOString(),
        });
      }

      // Auto-submit final team pitch (first member's draft as foundation)
      const lead = roster[0]!;
      ideas.push({
        id: crypto.randomUUID(),
        session_id: sessionId,
        team_id: team.id,
        author_player_uid: lead.playerUid,
        author_real_name: lead.realName,
        author_nickname: lead.nickname,
        startup_name: `Final · ${team.name}`,
        one_sentence_solution: `Team solution for ${team.domain}`,
        tools_integration: team.words.join(" + "),
        is_final_team_pitch: true,
        likes_count: 0,
        dislikes_count: 0,
        created_at: new Date().toISOString(),
      });
    }

    expect(ideas.filter((i) => i.is_final_team_pitch)).toHaveLength(8);
    expect(ideas.filter((i) => !i.is_final_team_pitch)).toHaveLength(40);
    markPitchSubmitted(sessionId);

    phaseReports.push({
      name: "Phase 4 · Team hub + final pitches",
      passed: true,
      detail: `8 hubs × 5 nicknames; 40 drafts + 8 final submitted_ideas (${MODE_SECONDS.team_brainstorm}s)`,
    });

    // =====================================================================
    // Phase 5 — Random pitch picker + pitcher re-roll
    // =====================================================================
    const firstPick = selectNextPitchTeam(teams, [], () => 0.1);
    expect(firstPick.done).toBe(false);
    if (firstPick.done) throw new Error("expected a pitch team");

    const pitchingTeam = firstPick.chosen;
    const roster: PitchRosterMember[] = assignments
      .filter((a) => a.team_id === pitchingTeam.id)
      .map((a) => ({
        player_uid: a.player_uid,
        nickname: a.nickname,
        real_name: a.real_name,
      }));
    expect(roster).toHaveLength(5);

    const firstPitcher = resolvePitcher(roster, { random: () => 0 });
    expect(firstPitcher.isFallback).toBe(false);
    expect(roster.some((m) => m.player_uid === firstPitcher.player_uid)).toBe(true);

    // Re-roll: decline first pitcher, pick someone else
    const reroll = resolvePitcher(roster, {
      declinedUids: [firstPitcher.player_uid],
      random: () => 0,
    });
    expect(reroll.isFallback).toBe(false);
    expect(reroll.player_uid).not.toBe(firstPitcher.player_uid);

    // All 8 teams can be selected sequentially (including those without ideas filtered out — never)
    const order = selectAllPitchTeamsSequentially(teams, () => 0);
    expect(order).toHaveLength(8);
    expect(new Set(order.map((t) => t.id)).size).toBe(8);

    const finalIdea = ideas.find(
      (i) => i.team_id === pitchingTeam.id && i.is_final_team_pitch,
    );
    expect(finalIdea?.startup_name).toContain(pitchingTeam.name);

    phaseReports.push({
      name: "Phase 5 · Pitch picker + re-roll",
      passed: true,
      detail: `Team ${pitchingTeam.team_number} · pitcher ${firstPitcher.nickname} → re-roll ${reroll.nickname}`,
    });

    // =====================================================================
    // Phase 6 — Mentor-controlled voting + tally
    // =====================================================================
    session.voting_open = true;
    session.voting_team_id = pitchingTeam.id;

    const votes: PitchVote[] = [];
    const pitchingMembers = players.filter((p) => p.teamId === pitchingTeam.id);
    const audience = players.filter((p) => p.teamId !== pitchingTeam.id);
    expect(pitchingMembers).toHaveLength(5);
    expect(audience).toHaveLength(35);

    // Pitching team blocked
    for (const member of pitchingMembers) {
      expect(() =>
        castPitchVoteSim(votes, ideas, {
          sessionId,
          teamId: pitchingTeam.id,
          voterUid: member.playerUid,
          voteType: "like",
          voterTeamId: member.teamId!,
        }),
      ).toThrow(/OWN_TEAM_VOTE_BLOCKED/);
    }

    // Audience casts votes (20 likes, 15 dislikes)
    let likeCount = 0;
    let dislikeCount = 0;
    audience.forEach((voter, index) => {
      const voteType = index < 20 ? "like" : "dislike";
      const result = castPitchVoteSim(votes, ideas, {
        sessionId,
        teamId: pitchingTeam.id,
        voterUid: voter.playerUid,
        voteType,
        voterTeamId: voter.teamId!,
      });
      if (voteType === "like") likeCount += 1;
      else dislikeCount += 1;

      saveStoredPitchVote(sessionId, pitchingTeam.id, voter.playerUid, voteType);
      expect(getStoredPitchVote(sessionId, pitchingTeam.id, voter.playerUid)).toBe(voteType);
      expect(result.likes_count + result.dislikes_count).toBe(index + 1);
    });

    expect(likeCount).toBe(20);
    expect(dislikeCount).toBe(15);
    expect(votes).toHaveLength(35);

    const tallied = ideas.find(
      (i) => i.team_id === pitchingTeam.id && i.is_final_team_pitch,
    )!;
    expect(tallied.likes_count).toBe(20);
    expect(tallied.dislikes_count).toBe(15);

    session.voting_open = false;
    session.voting_team_id = null;

    phaseReports.push({
      name: "Phase 6 · Mentor voting + tallies",
      passed: true,
      detail: `👍 ${tallied.likes_count} / 👎 ${tallied.dislikes_count} (35 audience; 5 blocked)`,
    });

    // =====================================================================
    // Phase 7 — Session completion + CSV export
    // =====================================================================
    session.is_active = false;
    session.ended_at = new Date().toISOString();
    expect(session.is_active).toBe(false);
    expect(session.ended_at).toBeTruthy();

    const csv = buildSessionCsv({ teams, assignments, ideas });
    expect(csv.startsWith("Team Number,Team Name,Global Challenge,Tools,")).toBe(true);

    for (let i = 1; i <= 40; i += 1) {
      expect(csv).toContain(`Student ${i}`);
      expect(csv).toContain(`Nick ${i}`);
    }

    for (const team of teams) {
      expect(csv).toContain(team.domain);
      expect(csv).toContain(team.words.join(" · "));
      expect(csv).toContain(`Final · ${team.name}`);
    }

    expect(csv).toContain("20"); // likes
    expect(csv).toContain("15"); // dislikes
    expect(csv.split("\n").length).toBeGreaterThan(40); // header + rows

    phaseReports.push({
      name: "Phase 7 · Complete + CSV export",
      passed: true,
      detail: `ended_at set; CSV ${csv.split("\n").length - 1} data rows; all 40 names present`,
    });

    // =====================================================================
    // Summary report
    // =====================================================================
    const allPassed = phaseReports.every((p) => p.passed);
    expect(allPassed).toBe(true);

    const lines = [
      "",
      "╔══════════════════════════════════════════════════════════════╗",
      "║     FULL GAME LIFECYCLE SIMULATION — ALL PHASES PASSED      ║",
      "╠══════════════════════════════════════════════════════════════╣",
      ...phaseReports.map(
        (p) => `║ ✓ ${p.name.padEnd(42)} ║`,
      ),
      "╠══════════════════════════════════════════════════════════════╣",
      `║ Session: ${session.date_label.padEnd(48)}║`,
      `║ Teams: 8 × 5 = 40 players · Final pitches: 8 · Votes: 35    ║`,
      `║ Pitching team #${String(pitchingTeam.team_number).padEnd(2)} · Likes 20 · Dislikes 15               ║`,
      "╚══════════════════════════════════════════════════════════════╝",
      ...phaseReports.map((p) => `  · ${p.name}: ${p.detail}`),
      "",
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  });
});
