import { beforeEach, describe, expect, it } from "vitest";

import {
  formatPitchSummary,
  getOrCreatePlayerUid,
  type IdeaNotes,
} from "@/lib/utils/player-storage";

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

describe("formatPitchSummary", () => {
  const domain = "ჯანდაცვა & MedTech";
  const words = ["აუზი", "დრონი", "რობოტი"];

  it("formats a complete pitch from notes, domain, and keywords", () => {
    const notes: IdeaNotes = {
      startupName: "BridgeBot",
      problemSolved: "Rural clinics lack fast supply drops",
      howWordsUsed: "Drones cross the bridge pool to robot hubs",
    };

    const pitch = formatPitchSummary(notes, domain, words);

    expect(pitch).toContain("🚀 BridgeBot");
    expect(pitch).toContain("🎯 Target industry: ჯანდაცვა & MedTech");
    expect(pitch).toContain("Problem: Rural clinics lack fast supply drops");
    expect(pitch).toContain("🔑 Keywords: აუზი · დრონი · რობოტი");
    expect(pitch).toContain(
      "How we use them: Drones cross the bridge pool to robot hubs"
    );
  });

  it("falls back to placeholders when fields are empty", () => {
    const pitch = formatPitchSummary(
      { startupName: "  ", problemSolved: "", howWordsUsed: "" },
      "  ",
      words
    );

    expect(pitch).toContain("🚀 Untitled Startup");
    expect(pitch).toContain("🎯 Target industry: —");
    expect(pitch).toContain("Problem: —");
    expect(pitch).toContain("How we use them: —");
  });
});
