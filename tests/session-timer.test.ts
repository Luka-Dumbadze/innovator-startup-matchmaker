import { describe, expect, it } from "vitest";

import {
  EMPTY_PITCH_FALLBACK,
  EXPIRY_INSTRUCTIONS,
  filterUnpitchedTeams,
  formatTimerClock,
  MODE_SECONDS,
  PHASE_GUIDANCE,
  parseTimerMode,
  resolvePitchIdea,
  resolvePitcher,
  selectAllPitchTeamsSequentially,
  selectNextPitchTeam,
  sessionTimerChannelName,
  VOTING_SECONDS,
} from "@/lib/timer/session-timer";

describe("session timer helpers", () => {
  it("builds the realtime channel name", () => {
    expect(sessionTimerChannelName("abc-123")).toBe("session-timer-abc-123");
  });

  it("formats remaining seconds as mm:ss", () => {
    expect(formatTimerClock(0)).toBe("00:00");
    expect(formatTimerClock(65)).toBe("01:05");
    expect(formatTimerClock(MODE_SECONDS.solo_brainstorm)).toBe("02:00");
    expect(formatTimerClock(MODE_SECONDS.team_brainstorm)).toBe("10:00");
    expect(formatTimerClock(MODE_SECONDS.pitch)).toBe("01:00");
  });

  it("parses timer modes including legacy brainstorm", () => {
    expect(parseTimerMode("solo_brainstorm")).toBe("solo_brainstorm");
    expect(parseTimerMode("team_brainstorm")).toBe("team_brainstorm");
    expect(parseTimerMode("pitch")).toBe("pitch");
    expect(parseTimerMode("brainstorm")).toBe("team_brainstorm");
    expect(parseTimerMode("nope")).toBe("solo_brainstorm");
  });

  it("exposes Georgian phase guidance for all modes", () => {
    expect(PHASE_GUIDANCE.solo_brainstorm.title).toContain("ინდივიდუალური");
    expect(PHASE_GUIDANCE.team_brainstorm.title).toContain("გუნდური");
    expect(PHASE_GUIDANCE.pitch.title).toContain("პიჩინგის");
  });

  it("exposes mode-specific expiry instructions", () => {
    expect(EXPIRY_INSTRUCTIONS.solo_brainstorm).toContain("ინდივიდუალური");
    expect(EXPIRY_INSTRUCTIONS.team_brainstorm).toContain("გუნდური");
    expect(EXPIRY_INSTRUCTIONS.pitch).toContain("პიჩინგი");
  });

  it("exposes a 15-second audience voting window", () => {
    expect(VOTING_SECONDS).toBe(15);
  });
});

describe("random pitch selector", () => {
  const eightTeams = Array.from({ length: 8 }, (_, i) => ({
    id: `team-uuid-${i + 1}`,
    team_number: i + 1,
    name: `Team ${i + 1}`,
  }));

  /** Teams 6–8 have no submitted idea (null). Selection must still include them. */
  const ideasByTeamId: Record<string, { startup_name: string } | null> = {
    "team-uuid-1": { startup_name: "Alpha" },
    "team-uuid-2": { startup_name: "Beta" },
    "team-uuid-3": { startup_name: "Gamma" },
    "team-uuid-4": { startup_name: "Delta" },
    "team-uuid-5": { startup_name: "Epsilon" },
    "team-uuid-6": null,
    "team-uuid-7": null,
    "team-uuid-8": null,
  };

  it("never filters teams out for missing submitted_ideas", () => {
    const unpitched = filterUnpitchedTeams(eightTeams, []);
    expect(unpitched).toHaveLength(8);

    for (const team of unpitched) {
      const idea = ideasByTeamId[team.id] ?? null;
      const resolved = resolvePitchIdea(idea);
      if (idea === null) {
        expect(resolved).toEqual({ ...EMPTY_PITCH_FALLBACK });
      } else {
        expect(resolved.startup_name).toBe(idea.startup_name);
      }
    }
  });

  it("selects all 8 teams sequentially even when 3 have no submitted ideas", () => {
    // Deterministic cycle: always pick index 0 of remaining → natural team order.
    const order = selectAllPitchTeamsSequentially(eightTeams, () => 0);

    expect(order).toHaveLength(8);
    expect(order.map((t) => t.id)).toEqual(eightTeams.map((t) => t.id));

    const pitches = order.map((team) => ({
      teamId: team.id,
      pitch: resolvePitchIdea(ideasByTeamId[team.id]),
    }));

    expect(
      pitches.filter(
        (p) => p.pitch.startup_name === EMPTY_PITCH_FALLBACK.startup_name,
      ),
    ).toHaveLength(3);
    expect(new Set(pitches.map((p) => p.teamId)).size).toBe(8);

    // After 8 picks the queue is exhausted.
    const done = selectNextPitchTeam(
      eightTeams,
      order.map((t) => t.id),
      () => 0,
    );
    expect(done).toEqual({ done: true });
  });

  it("tracks pitchedTeamIds with consistent string UUIDs (no mixed types)", () => {
    const step1 = selectNextPitchTeam(eightTeams, [], () => 0);
    expect(step1.done).toBe(false);
    if (step1.done) return;

    expect(step1.nextPitchedIds).toEqual(["team-uuid-1"]);
    expect(step1.nextPitchedIds.every((id) => typeof id === "string")).toBe(true);

    const step2 = selectNextPitchTeam(eightTeams, ["team-uuid-1"], () => 0);
    expect(step2.done).toBe(false);
    if (step2.done) return;
    expect(step2.chosen.id).toBe("team-uuid-2");
  });

  it("falls back to a default pitcher when roster is empty", () => {
    const pitcher = resolvePitcher([]);
    expect(pitcher.isFallback).toBe(true);
    expect(pitcher.nickname).toBe("გუნდის წარმომადგენელი");
  });

  it("falls back when every roster member has declined", () => {
    const pitcher = resolvePitcher(
      [
        { player_uid: "a", nickname: "A", real_name: "A" },
        { player_uid: "b", nickname: "B", real_name: "B" },
      ],
      { declinedUids: ["a", "b"] },
    );
    expect(pitcher.isFallback).toBe(true);
  });
});
