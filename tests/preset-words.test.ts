import { describe, expect, it } from "vitest";

import {
  GLOBAL_CHALLENGES,
  MATERIALS_AND_ELEMENTS,
  PHYSICAL_OBJECTS,
  TECH_DRIVERS,
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

  it("gives each team 1 challenge and 3 categorized tools", () => {
    const teams = generateRandomPresets();
    const physicalSet = new Set(PHYSICAL_OBJECTS);
    const techSet = new Set(TECH_DRIVERS);
    const materialsSet = new Set(MATERIALS_AND_ELEMENTS);
    const challengeSet = new Set(GLOBAL_CHALLENGES);

    for (const team of teams) {
      expect(challengeSet.has(team.domain)).toBe(true);
      expect(team.words).toHaveLength(3);
      expect(physicalSet.has(team.words[0]!)).toBe(true);
      expect(techSet.has(team.words[1]!)).toBe(true);
      expect(materialsSet.has(team.words[2]!)).toBe(true);
    }
  });

  it("uses unique challenges and unique tools per category across teams", () => {
    const teams = generateRandomPresets();
    const challenges = teams.map((t) => t.domain);
    const physical = teams.map((t) => t.words[0]!);
    const tech = teams.map((t) => t.words[1]!);
    const materials = teams.map((t) => t.words[2]!);

    expect(new Set(challenges).size).toBe(8);
    expect(new Set(physical).size).toBe(8);
    expect(new Set(tech).size).toBe(8);
    expect(new Set(materials).size).toBe(8);
  });
});
