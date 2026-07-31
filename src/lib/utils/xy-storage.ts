const XY_UID_KEY = "xy_player_uid";
const XY_NAME_KEY = "xy_player_name";
const XY_VOTE_KEY = "xy_last_vote";

export const XY_NAME_MAX = 60;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Stable per-device identity so re-joins and reloads stay idempotent. */
export function getOrCreateXyPlayerUid(): string {
  if (!canUseStorage()) {
    return crypto.randomUUID();
  }

  const existing = window.localStorage.getItem(XY_UID_KEY);
  if (existing && existing.trim()) {
    return existing;
  }

  const uid = crypto.randomUUID();
  window.localStorage.setItem(XY_UID_KEY, uid);
  return uid;
}

export function getXyPlayerName(): string | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(XY_NAME_KEY);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function saveXyPlayerName(fullName: string): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(XY_NAME_KEY, fullName.trim().slice(0, XY_NAME_MAX));
}

export type XyStoredVote = {
  sessionId: string;
  round: number;
  vote: "X" | "Y";
};

/**
 * Remembered tap so a reload keeps the locked "vote received" state instead of
 * flashing the buttons again (which invites an accidental second tap).
 */
export function getXyStoredVote(): XyStoredVote | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(XY_VOTE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<XyStoredVote>;
    if (
      typeof parsed.sessionId === "string" &&
      typeof parsed.round === "number" &&
      (parsed.vote === "X" || parsed.vote === "Y")
    ) {
      return { sessionId: parsed.sessionId, round: parsed.round, vote: parsed.vote };
    }
  } catch {
    // Corrupted entry — treat as "no remembered vote".
  }

  return null;
}

export function saveXyStoredVote(stored: XyStoredVote): void {
  if (!canUseStorage() || !stored.sessionId) return;
  window.localStorage.setItem(XY_VOTE_KEY, JSON.stringify(stored));
}
