import { describe, expect, it } from "vitest";

import {
  EXPIRY_INSTRUCTIONS,
  formatTimerClock,
  MODE_SECONDS,
  PHASE_GUIDANCE,
  parseTimerMode,
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
