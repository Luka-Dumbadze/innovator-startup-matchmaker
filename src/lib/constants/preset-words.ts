/**
 * Global Challenge + 3 Structured Innovation Tools banks for daily auto-fill.
 *
 * Formula per team:
 *   1 Global Human Challenge + 1 Physical Object + 1 Tech Driver + 1 Material / Element
 */

export type TeamColorPreset = {
  label: string;
  hex: string;
};

export type TeamPresetConfig = {
  teamNumber: number;
  name: string;
  color: string;
  /** Global Human Challenge (stored in teams.domain). */
  domain: string;
  /**
   * Exactly 3 innovation tools, ordered as:
   * [0] Physical Object · [1] Tech Driver · [2] Material / Element
   */
  words: string[];
};

/** Labels for the 3 structured tool slots (index-aligned with `words`). */
export const TOOL_SLOT_META = [
  { icon: "🛠️", label: "ნივთი", shortLabel: "Object" },
  { icon: "⚡", label: "ტექნოლოგია", shortLabel: "Tech" },
  { icon: "🧱", label: "მასალა / ელემენტი", shortLabel: "Material" },
] as const;

/** Fixed palette for the 8 morning teams (order = team_number 1…8). */
export const TEAM_COLOR_PRESETS: readonly TeamColorPreset[] = [
  { label: "Blue", hex: "#2563EB" },
  { label: "Emerald", hex: "#059669" },
  { label: "Rose", hex: "#E11D48" },
  { label: "Amber", hex: "#D97706" },
  { label: "Purple", hex: "#7C3AED" },
  { label: "Cyan", hex: "#0891B2" },
  { label: "Orange", hex: "#EA580C" },
  { label: "Pink", hex: "#DB2777" },
] as const;

/** 12 short Global Human Challenges. */
export const GLOBAL_CHALLENGES: readonly string[] = [
  "კლიმატის კრიზისი",
  "მენტალური ჯანმრთელობა",
  "წყლის დეფიციტი",
  "საკვების დეფიციტი",
  "პლასტმასი & ნარჩენები",
  "ენერგოკრიზისი",
  "ხანდაზმულთა მოვლა",
  "დეზინფორმაცია & კიბერრისკები",
  "განათლების უთანასწორობა",
  "ურბანული საცობები",
  "AI & დასაქმება",
  "გლობალური სიღარიბე",
] as const;

/** @deprecated Prefer GLOBAL_CHALLENGES — kept for older imports. */
export const GEORGIAN_SECTORS = GLOBAL_CHALLENGES;

/** Everyday physical objects used as innovation building blocks. */
export const PHYSICAL_OBJECTS: readonly string[] = [
  "ქოლგა",
  "სამაჯური",
  "რუკა",
  "დაფა",
  "ზურგჩანთა",
  "წიგნი",
  "კარი",
  "სათვალე",
] as const;

/** Technology drivers that power the solution. */
export const TECH_DRIVERS: readonly string[] = [
  "დურბინდი",
  "პულტი",
  "ბატარეა",
  "კამერა",
  "Wi-Fi",
  "ყურსასმენი",
  "ელექტროძრავა",
  "ხელოვნური ინტელექტი",
] as const;

/** Materials and elements that shape the solution. */
export const MATERIALS_AND_ELEMENTS: readonly string[] = [
  "პლასტმასი",
  "რეზინი",
  "მინა",
  "სპილენცი",
  "წყალი",
  "ქვიშა",
  "პოლიეთილენი",
  "ტყავი",
] as const;

/** @deprecated Prefer MATERIALS_AND_ELEMENTS — kept for older imports. */
export const ENVIRONMENT_EFFECTS = MATERIALS_AND_ELEMENTS;

/** Flat union of all tool banks (legacy helpers / docs). */
export const GEORGIAN_PRESET_WORDS: readonly string[] = [
  ...PHYSICAL_OBJECTS,
  ...TECH_DRIVERS,
  ...MATERIALS_AND_ELEMENTS,
] as const;

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Returns 8 team configs with fixed color presets and the structured formula:
 * 1 Global Challenge + 1 Physical Object + 1 Tech Driver + 1 Material / Element.
 *
 * Each pool is independently Fisher-Yates shuffled on every call; teams 1–8 receive
 * the 1st–8th shuffled items (no duplicates within a category per session).
 */
export function generateRandomPresets(): TeamPresetConfig[] {
  const challenges = shuffleArray([...GLOBAL_CHALLENGES]).slice(0, 8);
  const physical = shuffleArray([...PHYSICAL_OBJECTS]);
  const tech = shuffleArray([...TECH_DRIVERS]);
  const materials = shuffleArray([...MATERIALS_AND_ELEMENTS]);

  return TEAM_COLOR_PRESETS.map((preset, index) => ({
    teamNumber: index + 1,
    name: preset.label,
    color: preset.hex,
    domain: challenges[index]!,
    words: [physical[index]!, tech[index]!, materials[index]!],
  }));
}
