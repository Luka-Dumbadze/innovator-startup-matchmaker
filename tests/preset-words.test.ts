import { describe, expect, it } from "vitest";

import {
  generateRandomPresets,
  TEAM_COLOR_PRESETS,
} from "@/lib/constants/preset-words";

describe("generateRandomPresets", () => {
  it("returns exactly 8 teams", () => {
    const teams = generateRandomPresets();
    expect(teams).toHaveLength(8);
  });

  it("assigns distinct preset colors and sequential team numbers", () => {
    const teams = generateRandomPresets();
    const colors = teams.map((t) => t.color);
    const numbers = teams.map((t) => t.teamNumber);

    expect(new Set(colors).size).toBe(8);
    expect(colors).toEqual(TEAM_COLOR_PRESETS.map((p) => p.hex));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("gives each team exactly 4 non-empty words", () => {
    const teams = generateRandomPresets();

    for (const team of teams) {
      expect(team.words).toHaveLength(4);
      for (const word of team.words) {
        expect(typeof word).toBe("string");
        expect(word.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("uses unique words across all teams when the bank allows", () => {
    const teams = generateRandomPresets();
    const allWords = teams.flatMap((t) => t.words);
    expect(allWords).toHaveLength(32);
    expect(new Set(allWords).size).toBe(32);
  });
});
