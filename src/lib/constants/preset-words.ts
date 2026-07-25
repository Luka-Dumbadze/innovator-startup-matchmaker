/**
 * Global Challenge + 3 Structured Innovation Tools banks for daily auto-fill.
 *
 * Formula per team:
 *   1 Global Human Challenge + 1 Physical Object + 1 Tech Driver + 1 Environment Effect
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
   * [0] Physical Object · [1] Tech Driver · [2] Environment Effect
   */
  words: string[];
};

/** Labels for the 3 structured tool slots (index-aligned with `words`). */
export const TOOL_SLOT_META = [
  { icon: "🛠️", label: "ფიზიკური ნივთი", shortLabel: "Object" },
  { icon: "⚡", label: "ტექნოლოგია", shortLabel: "Tech" },
  { icon: "🌀", label: "გარემო/ტრიგერი", shortLabel: "Environment" },
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
  "სარკე",
  "ქოლგა",
  "კარი",
  "მაცივარი",
  "ჩანთა",
  "სათვალე",
  "სკამი",
  "ბეჭედი",
  "ყურსასმენები",
  "საათი",
  "ფანჯარა",
  "მაგიდა",
] as const;

/** Technology drivers that power the solution. */
export const TECH_DRIVERS: readonly string[] = [
  "დრონი",
  "სენსორი",
  "მზის პანელი",
  "AI რობოტი",
  "აპლიკაცია",
  "ბიომეტრია",
  "კაფსულა",
  "კამერა",
  "ბატარეა",
  "ანტენა",
  "მიკროფონი",
  "პროექტორი",
] as const;

/** Environment / emotional / sensory triggers. */
export const ENVIRONMENT_EFFECTS: readonly string[] = [
  "მუსიკა",
  "სიბნელე",
  "სიცხე",
  "ხმაური",
  "წვიმა",
  "სიჩქარე",
  "ემოცია",
  "ქარი",
  "სინათლე",
  "სიჩუმე",
  "ველი",
  "ტალღა",
] as const;

/** Flat union of all tool banks (legacy helpers / docs). */
export const GEORGIAN_PRESET_WORDS: readonly string[] = [
  ...PHYSICAL_OBJECTS,
  ...TECH_DRIVERS,
  ...ENVIRONMENT_EFFECTS,
] as const;

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Unique strings drawn from a bank (falls back to cycling if bank is short). */
function pickUniqueFromBank(bank: readonly string[], count: number): string[] {
  const uniqueBank = [...new Set(bank)];
  const pool = shuffleInPlace([...uniqueBank]);
  const picked: string[] = [];

  while (picked.length < count) {
    if (pool.length === 0) {
      pool.push(...shuffleInPlace([...uniqueBank]));
    }
    const next = pool.pop()!;
    if (!picked.includes(next) || picked.length >= uniqueBank.length) {
      picked.push(next);
    }
  }

  return picked;
}

/**
 * Returns 8 team configs with fixed color presets and the structured formula:
 * 1 Global Challenge + 1 Physical Object + 1 Tech Driver + 1 Environment Effect.
 */
export function generateRandomPresets(): TeamPresetConfig[] {
  const challenges = pickUniqueFromBank(GLOBAL_CHALLENGES, 8);
  const physical = pickUniqueFromBank(PHYSICAL_OBJECTS, 8);
  const tech = pickUniqueFromBank(TECH_DRIVERS, 8);
  const environment = pickUniqueFromBank(ENVIRONMENT_EFFECTS, 8);

  return TEAM_COLOR_PRESETS.map((preset, index) => ({
    teamNumber: index + 1,
    name: preset.label,
    color: preset.hex,
    domain: challenges[index]!,
    words: [physical[index]!, tech[index]!, environment[index]!],
  }));
}
