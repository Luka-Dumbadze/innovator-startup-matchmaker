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

  it("gives each team 1 non-empty domain and exactly 3 keywords", () => {
    const teams = generateRandomPresets();

    for (const team of teams) {
      expect(typeof team.domain).toBe("string");
      expect(team.domain.trim().length).toBeGreaterThan(0);
      expect(team.words).toHaveLength(3);
      for (const word of team.words) {
        expect(typeof word).toBe("string");
        expect(word.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("uses unique domains and unique words across teams when banks allow", () => {
    const teams = generateRandomPresets();
    const domains = teams.map((t) => t.domain);
    const allWords = teams.flatMap((t) => t.words);

    expect(new Set(domains).size).toBe(8);
    expect(allWords).toHaveLength(24);
    expect(new Set(allWords).size).toBe(24);
  });
});
