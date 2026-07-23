import type { Team } from "@/types/game";

const PLAYER_UID_KEY = "smm_player_uid";
const assignmentKey = (sessionId: string) => `smm_assignment:${sessionId}`;
const notesKey = (sessionId: string) => `smm_idea_notes:${sessionId}`;

/** Local brainstorm scratchpad for a daily session. */
export type IdeaNotes = {
  startupName: string;
  problemSolved: string;
  howWordsUsed: string;
};

export const EMPTY_IDEA_NOTES: IdeaNotes = {
  startupName: "",
  problemSolved: "",
  howWordsUsed: "",
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isTeamShape(value: unknown): value is Team {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<Team>;
  return (
    typeof t.id === "string" &&
    typeof t.session_id === "string" &&
    typeof t.team_number === "number" &&
    typeof t.name === "string" &&
    typeof t.color === "string" &&
    typeof t.domain === "string" &&
    Array.isArray(t.words) &&
    t.words.length === 3 &&
    typeof t.max_capacity === "number" &&
    typeof t.current_count === "number"
  );
}

function isIdeaNotesShape(value: unknown): value is IdeaNotes {
  if (!value || typeof value !== "object") return false;
  const n = value as Partial<IdeaNotes>;
  return (
    typeof n.startupName === "string" &&
    typeof n.problemSolved === "string" &&
    typeof n.howWordsUsed === "string"
  );
}

/**
 * Stable anonymous player identity for this browser.
 * Survives refresh so re-scans stay idempotent with assign_player_atomically.
 */
export function getOrCreatePlayerUid(): string {
  if (!canUseStorage()) {
    return crypto.randomUUID();
  }

  const existing = window.localStorage.getItem(PLAYER_UID_KEY);
  if (existing && existing.trim()) {
    return existing;
  }

  const uid = crypto.randomUUID();
  window.localStorage.setItem(PLAYER_UID_KEY, uid);
  return uid;
}

/** Cached team assignment for a session (optimistic UX + offline recall). */
export function getSavedAssignment(sessionId: string): Team | null {
  if (!canUseStorage() || !sessionId) return null;
  const parsed = safeParse<unknown>(window.localStorage.getItem(assignmentKey(sessionId)));
  return isTeamShape(parsed) ? parsed : null;
}

export function saveAssignment(sessionId: string, teamData: Team): void {
  if (!canUseStorage() || !sessionId) return;
  window.localStorage.setItem(assignmentKey(sessionId), JSON.stringify(teamData));
}

export function getIdeaNotes(sessionId: string): IdeaNotes {
  if (!canUseStorage() || !sessionId) return { ...EMPTY_IDEA_NOTES };
  const parsed = safeParse<unknown>(window.localStorage.getItem(notesKey(sessionId)));
  return isIdeaNotesShape(parsed) ? parsed : { ...EMPTY_IDEA_NOTES };
}

export function saveIdeaNotes(sessionId: string, notes: IdeaNotes): void {
  if (!canUseStorage() || !sessionId) return;
  window.localStorage.setItem(notesKey(sessionId), JSON.stringify(notes));
}

/** Formats notes + domain + keywords into a 1-minute elevator pitch. */
export function formatPitchSummary(
  notes: IdeaNotes,
  domain: string,
  words: string[]
): string {
  const name = notes.startupName.trim() || "Untitled Startup";
  const problem = notes.problemSolved.trim() || "—";
  const usage = notes.howWordsUsed.trim() || "—";
  const sector = domain.trim() || "—";
  const wordLine = words.join(" · ");

  return [
    `🚀 ${name}`,
    "",
    `🎯 Target industry: ${sector}`,
    `Problem: ${problem}`,
    "",
    `🔑 Keywords: ${wordLine}`,
    `How we use them: ${usage}`,
  ].join("\n");
}
