/**
 * Georgian word bank + team color presets for daily session auto-fill.
 */

export type TeamColorPreset = {
  label: string;
  hex: string;
};

export type TeamPresetConfig = {
  teamNumber: number;
  name: string;
  color: string;
  words: [string, string, string, string];
};

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

/**
 * 50+ concrete, visual Georgian words — good prompt fuel for ideation games.
 */
export const GEORGIAN_PRESET_WORDS: readonly string[] = [
  "აუზი",
  "დრონი",
  "მზის პანელი",
  "რობოტი",
  "სარკე",
  "მუსიკა",
  "სათვალე",
  "ველოსიპედი",
  "ქოლგა",
  "ხიდი",
  "ლიფტი",
  "კამერა",
  "ტელესკოპი",
  "ფანარი",
  "კარადა",
  "საათი",
  "წიგნი",
  "ფანქარი",
  "რვეული",
  "ჩანთა",
  "ფეხსაცმელი",
  "ქუდი",
  "შარფი",
  "გიტარა",
  "დრამი",
  "მიკროფონი",
  "ყურსასმენი",
  "ტელეფონი",
  "პლანშეტი",
  "კომპიუტერი",
  "კლავიატურა",
  "მაუსი",
  "პრინტერი",
  "ბატარეა",
  "დამტენი",
  "ანტენა",
  "რადიო",
  "ტელევიზორი",
  "პროექტორი",
  "ეკრანი",
  "რუკა",
  "კომპასი",
  "მიკროსკოპი",
  "ლაბორატორია",
  "მაგნიტი",
  "ძრავა",
  "ბორბალი",
  "სკეიტბორდი",
  "სკუტერი",
  "ნავი",
  "თვითმფრინავი",
  "ბუშტი",
  "ცათამბჯენი",
  "კარიბჭე",
  "ფანჯარა",
  "კიბე",
  "აივანი",
  "ბაღი",
  "შადრევანი",
  "შუქნიშანი",
  "ავტობუსი",
  "მატარებელი",
  "მეტრო",
  "გზა",
  "გვირაბი",
  "პარკი",
  "მოედანი",
  "ბაზარი",
  "კაფე",
  "სამზარეულო",
  "ღუმელი",
  "მაცივარი",
  "ქვაბი",
  "თეფში",
  "ჭიქა",
  "კოვზი",
  "ჩანგალი",
  "დანა",
  "სახლი",
  "კარავი",
  "სავარძელი",
  "მაგიდა",
  "თარო",
  "ნახატი",
  "ფუნჯი",
  "საღებავი",
  "კანვასი",
  "ქანდაკება",
  "ბურთი",
  "რაკეტა",
  "ბადე",
  "სპორტდარბაზი",
  "საუნა",
  "ტალღა",
  "ქვიშა",
  "კლდე",
  "ტყე",
  "ხე",
  "ყვავილი",
  "თესლი",
  "ფუტკარი",
  "პეპელა",
  "ჩიტი",
  "თევზი",
  "ვარსკვლავი",
  "მთვარე",
  "მზე",
  "ღრუბელი",
  "წვიმა",
  "ცისარტყელა",
  "ელვა",
  "ქარი",
  "თოვლი",
  "ჩანჩქერი",
  "კარაქი",
  "პური",
  "ყავა",
  "თაფლი",
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

/** Unique words drawn from the bank (falls back to cycling if bank is short). */
function pickUniqueWords(count: number): string[] {
  const uniqueBank = [...new Set(GEORGIAN_PRESET_WORDS)];
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
 * Returns 8 team configs with fixed color presets and 4 randomized
 * Georgian words each (32 unique words when the bank allows).
 */
export function generateRandomPresets(): TeamPresetConfig[] {
  const words = pickUniqueWords(32);

  return TEAM_COLOR_PRESETS.map((preset, index) => {
    const offset = index * 4;
    return {
      teamNumber: index + 1,
      name: preset.label,
      color: preset.hex,
      words: [
        words[offset]!,
        words[offset + 1]!,
        words[offset + 2]!,
        words[offset + 3]!,
      ] as [string, string, string, string],
    };
  });
}
