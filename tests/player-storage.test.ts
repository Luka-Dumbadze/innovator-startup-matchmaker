import { beforeEach, describe, expect, it } from "vitest";

import {
  clampIdeaField,
  formatPitchSummary,
  getIdeaNotes,
  getOrCreatePlayerUid,
  getPlayerProfile,
  IDEA_FIELD_MAX,
  saveIdeaNotes,
  savePlayerProfile,
  teamIdeasChannelName,
} from "@/lib/utils/player-storage";
import type { IdeaNotes } from "@/types/game";

const PLAYER_UID_KEY = "smm_player_uid";

describe("getOrCreatePlayerUid", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates and persists a UUID on first call", () => {
    const uid = getOrCreatePlayerUid();

    expect(uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(window.localStorage.getItem(PLAYER_UID_KEY)).toBe(uid);
  });

  it("returns the same UUID on subsequent calls", () => {
    const first = getOrCreatePlayerUid();
    const second = getOrCreatePlayerUid();

    expect(second).toBe(first);
    expect(window.localStorage.getItem(PLAYER_UID_KEY)).toBe(first);
  });

  it("reuses a pre-seeded localStorage value", () => {
    const seeded = "11111111-2222-4333-a444-555555555555";
    window.localStorage.setItem(PLAYER_UID_KEY, seeded);

    expect(getOrCreatePlayerUid()).toBe(seeded);
  });
});

describe("player profile storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and retrieves a trimmed profile", () => {
    savePlayerProfile({ realName: "  Luka Dumbadze ", nickname: " TechWiz " });
    expect(getPlayerProfile()).toEqual({
      realName: "Luka Dumbadze",
      nickname: "TechWiz",
    });
  });
});

describe("idea notes storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clamps fields to 140 characters", () => {
    const long = "x".repeat(200);
    expect(clampIdeaField(long)).toHaveLength(IDEA_FIELD_MAX);
  });

  it("saves structured notes and migrates legacy free-text shape", () => {
    const sessionId = "sess-1";
    window.localStorage.setItem(
      `smm_idea_notes:${sessionId}`,
      JSON.stringify({
        startupName: "LegacyCo",
        problemSolved: "Old problem",
        howWordsUsed: "Old tools",
      })
    );

    expect(getIdeaNotes(sessionId)).toEqual({
      startupName: "LegacyCo",
      oneSentenceSolution: "Old problem",
      toolsIntegration: "Old tools",
    });

    const next: IdeaNotes = {
      startupName: "SolarLink",
      oneSentenceSolution: "Clean energy for rural clinics",
      toolsIntegration: "Pool + drone + robot hubs",
    };
    saveIdeaNotes(sessionId, next);
    expect(getIdeaNotes(sessionId)).toEqual(next);
  });
});

describe("formatPitchSummary", () => {
  const domain = "ჯანდაცვა & MedTech";
  const words = ["აუზი", "დრონი", "რობოტი"];

  it("formats a complete pitch from notes, domain, and keywords", () => {
    const notes: IdeaNotes = {
      startupName: "BridgeBot",
      oneSentenceSolution: "Rural clinics lack fast supply drops",
      toolsIntegration: "Drones cross the bridge pool to robot hubs",
    };

    const pitch = formatPitchSummary(notes, domain, words);

    expect(pitch).toContain("🚀 BridgeBot");
    expect(pitch).toContain("🎯 Target industry: ჯანდაცვა & MedTech");
    expect(pitch).toContain(
      "1-sentence solution: Rural clinics lack fast supply drops"
    );
    expect(pitch).toContain("🔑 Keywords: აუზი · დრონი · რობოტი");
    expect(pitch).toContain(
      "3 tools integration: Drones cross the bridge pool to robot hubs"
    );
  });

  it("falls back to placeholders when fields are empty", () => {
    const pitch = formatPitchSummary(
      { startupName: "  ", oneSentenceSolution: "", toolsIntegration: "" },
      "  ",
      words
    );

    expect(pitch).toContain("🚀 Untitled Startup");
    expect(pitch).toContain("🎯 Target industry: —");
    expect(pitch).toContain("1-sentence solution: —");
    expect(pitch).toContain("3 tools integration: —");
  });
});

describe("teamIdeasChannelName", () => {
  it("builds the realtime channel name", () => {
    expect(teamIdeasChannelName("s1", "t1")).toBe("team-ideas-s1-t1");
  });
});
