/**
 * The XY RPCs raise tagged exceptions (`XY_SESSION_NOT_ACTIVE: <uuid>`), which
 * reach the phone verbatim through PostgREST. Students get the Georgian
 * explanation; the raw tag is kept out of the way for the mentor to read.
 */

const XY_ERROR_MESSAGES: Record<string, string> = {
  XY_SESSION_NOT_ACTIVE: "სესია აქტიური აღარ არის — დაელოდეთ მენტორს",
  XY_VOTING_CLOSED: "რაუნდი ჯერ არ არის გახსნილი",
  XY_PLAYER_NOT_FOUND: "ჯერ არ ხართ სესიაში — სცადეთ თავიდან",
  FULL_NAME_REQUIRED: "ჩაწერეთ სახელი და გვარი",
  PLAYER_UID_REQUIRED: "მოწყობილობა ვერ ამოვიცანით — გადატვირთეთ გვერდი",
  INVALID_VOTE: "არასწორი ხმა — აირჩიეთ X ან Y",
};

export const XY_GENERIC_JOIN_ERROR = "დაერთება ვერ მოხერხდა — სცადეთ თავიდან";
export const XY_GENERIC_VOTE_ERROR = "ხმა ვერ გაიგზავნა — სცადეთ თავიდან";

/** Student-facing text for an RPC failure, falling back to `fallback`. */
export function describeXyError(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  for (const [tag, message] of Object.entries(XY_ERROR_MESSAGES)) {
    if (raw.includes(tag)) return message;
  }

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // Network / PostgREST noise is unreadable on a phone, so it is appended
  // rather than shown alone — the mentor can still see what broke.
  return `${fallback} (${trimmed})`;
}
