/**
 * Georgian display labels for the big-screen host dashboard (/host).
 */

export const HOST_TEAM_DISPLAY: Record<
  number,
  { emoji: string; title: string }
> = {
  1: { emoji: "🔵", title: "გუნდი 1 (ლურჯები)" },
  2: { emoji: "🟢", title: "გუნდი 2 (მწვანეები)" },
  3: { emoji: "🔴", title: "გუნდი 3 (წითლები)" },
  4: { emoji: "🟡", title: "გუნდი 4 (ყვითლები)" },
  5: { emoji: "🟣", title: "გუნდი 5 (იასამნისფრები)" },
  6: { emoji: "🩵", title: "გუნდი 6 (ცისფრები)" },
  7: { emoji: "🟠", title: "გუნდი 7 (ნარინჯისფრები)" },
  8: { emoji: "🩷", title: "გუნდი 8 (ვარდისფრები)" },
};

export const HOST_TOOL_ROLES = [
  { icon: "🛠️", role: "ნივთი" },
  { icon: "⚡", role: "ტექნოლოგია" },
  { icon: "🌀", role: "გარემო" },
] as const;

export function hostTeamTitle(teamNumber: number, fallbackName: string): string {
  const preset = HOST_TEAM_DISPLAY[teamNumber];
  if (!preset) return fallbackName;
  return `${preset.emoji} ${preset.title}`;
}
