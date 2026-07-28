import type { IdeaNotes, PlayerProfile, Team } from "@/types/game";

const PLAYER_UID_KEY = "smm_player_uid";
const PLAYER_PROFILE_KEY = "smm_player_profile";
const assignmentKey = (sessionId: string) => `smm_assignment:${sessionId}`;
const notesKey = (sessionId: string) => `smm_idea_notes:${sessionId}`;
const foundationKey = (sessionId: string) => `smm_team_foundation:${sessionId}`;
const submittedKey = (sessionId: string) => `smm_submitted_pitch:${sessionId}`;
const pitchVoteKey = (sessionId: string, teamId: string, voterUid: string) =>
  `smm_pitch_vote:${sessionId}:${teamId}:${voterUid}`;

export type StoredPitchVote = "like" | "dislike";

export const IDEA_FIELD_MAX = 140;

export const EMPTY_IDEA_NOTES: IdeaNotes = {
  startupName: "",
  oneSentenceSolution: "",
  toolsIntegration: "",
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

function normalizeIdeaNotes(value: unknown): IdeaNotes | null {
  if (!value || typeof value !== "object") return null;
  const n = value as Record<string, unknown>;

  // New shape
  if (
    typeof n.startupName === "string" &&
    typeof n.oneSentenceSolution === "string" &&
    typeof n.toolsIntegration === "string"
  ) {
    return {
      startupName: n.startupName,
      oneSentenceSolution: n.oneSentenceSolution,
      toolsIntegration: n.toolsIntegration,
    };
  }

  // Legacy free-text shape
  if (
    typeof n.startupName === "string" &&
    typeof n.problemSolved === "string" &&
    typeof n.howWordsUsed === "string"
  ) {
    return {
      startupName: n.startupName,
      oneSentenceSolution: n.problemSolved,
      toolsIntegration: n.howWordsUsed,
    };
  }

  return null;
}

function isProfileShape(value: unknown): value is PlayerProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PlayerProfile>;
  return (
    typeof p.realName === "string" &&
    p.realName.trim().length > 0 &&
    typeof p.nickname === "string" &&
    p.nickname.trim().length > 0
  );
}

export function clampIdeaField(value: string): string {
  return value.slice(0, IDEA_FIELD_MAX);
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

export function getPlayerProfile(): PlayerProfile | null {
  if (!canUseStorage()) return null;
  const parsed = safeParse<unknown>(window.localStorage.getItem(PLAYER_PROFILE_KEY));
  return isProfileShape(parsed) ? parsed : null;
}

export function savePlayerProfile(profile: PlayerProfile): void {
  if (!canUseStorage()) return;
  const cleaned: PlayerProfile = {
    realName: profile.realName.trim(),
    nickname: profile.nickname.trim(),
  };
  window.localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(cleaned));
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
  const normalized = normalizeIdeaNotes(
    safeParse<unknown>(window.localStorage.getItem(notesKey(sessionId)))
  );
  return normalized ?? { ...EMPTY_IDEA_NOTES };
}

export function saveIdeaNotes(sessionId: string, notes: IdeaNotes): void {
  if (!canUseStorage() || !sessionId) return;
  const clamped: IdeaNotes = {
    startupName: clampIdeaField(notes.startupName),
    oneSentenceSolution: clampIdeaField(notes.oneSentenceSolution),
    toolsIntegration: clampIdeaField(notes.toolsIntegration),
  };
  window.localStorage.setItem(notesKey(sessionId), JSON.stringify(clamped));
}

export function getTeamFoundation(sessionId: string): IdeaNotes | null {
  if (!canUseStorage() || !sessionId) return null;
  return normalizeIdeaNotes(
    safeParse<unknown>(window.localStorage.getItem(foundationKey(sessionId)))
  );
}

export function saveTeamFoundation(sessionId: string, notes: IdeaNotes): void {
  if (!canUseStorage() || !sessionId) return;
  window.localStorage.setItem(foundationKey(sessionId), JSON.stringify(notes));
  saveIdeaNotes(sessionId, notes);
}

export function markPitchSubmitted(sessionId: string): void {
  if (!canUseStorage() || !sessionId) return;
  window.localStorage.setItem(submittedKey(sessionId), "1");
}

export function isPitchSubmitted(sessionId: string): boolean {
  if (!canUseStorage() || !sessionId) return false;
  return window.localStorage.getItem(submittedKey(sessionId)) === "1";
}

/** Persist audience like/dislike for a specific team pitch (survives reload). */
export function getStoredPitchVote(
  sessionId: string,
  teamId: string,
  voterUid: string
): StoredPitchVote | null {
  if (!canUseStorage() || !sessionId || !teamId || !voterUid) return null;
  const raw = window.localStorage.getItem(pitchVoteKey(sessionId, teamId, voterUid));
  return raw === "like" || raw === "dislike" ? raw : null;
}

export function saveStoredPitchVote(
  sessionId: string,
  teamId: string,
  voterUid: string,
  voteType: StoredPitchVote
): void {
  if (!canUseStorage() || !sessionId || !teamId || !voterUid) return;
  window.localStorage.setItem(pitchVoteKey(sessionId, teamId, voterUid), voteType);
}

/** Formats structured idea + global challenge + 3 tools into a pitch sentence. */
export function formatPitchSummary(
  notes: IdeaNotes,
  domain: string,
  words: string[]
): string {
  const name = notes.startupName.trim() || "Untitled Startup";
  const solution = notes.oneSentenceSolution.trim() || "—";
  const challenge = domain.trim() || "—";
  const physical = words[0]?.trim() || "—";
  const tech = words[1]?.trim() || "—";
  const environment = words[2]?.trim() || "—";

  return `ჩვენი სტარტაპი ${name} ებრძვის ${challenge}-ს. ჩვენ შევქმენით ${solution}, სადაც გამოყენებულია ${physical}, ${tech} და ${environment}.`;
}

export function teamIdeasChannelName(sessionId: string, teamId: string): string {
  return `team-ideas-${sessionId}-${teamId}`;
}
