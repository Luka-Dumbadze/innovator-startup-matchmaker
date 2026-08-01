import type { XYIndividualVote } from "@/types/xy";

/** Shape of a Supabase Realtime `postgres_changes` payload for xy_individual_votes. */
export type XyIndividualVoteChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};

/**
 * Fills in the mentor-edit audit fields a row may not carry. An absent or null
 * `edited_by_mentor` means the student cast the vote themselves, and `edited_at`
 * only ever holds a value on rows the mentor actually touched.
 */
export function normalizeXyIndividualVoteRow(
  row: Record<string, unknown>
): XYIndividualVote {
  const editedByMentor = row.edited_by_mentor === true;

  return {
    id: typeof row.id === "string" ? row.id : "",
    session_id: typeof row.session_id === "string" ? row.session_id : "",
    round_number: typeof row.round_number === "number" ? row.round_number : 0,
    player_id: typeof row.player_id === "string" ? row.player_id : "",
    vote: row.vote === "X" ? "X" : "Y",
    edited_by_mentor: editedByMentor,
    edited_at:
      editedByMentor && typeof row.edited_at === "string" ? row.edited_at : null,
  };
}

/**
 * Applies one realtime phone-vote event to the local list so the mentor's
 * "38 / 40" counter and submission roster update the instant a student taps.
 *
 * Returns the original array when nothing changed.
 */
export function applyXyIndividualVoteEvent(
  votes: readonly XYIndividualVote[],
  change: XyIndividualVoteChange,
  sessionId: string
): XYIndividualVote[] {
  if (change.eventType === "DELETE") {
    const removedId = typeof change.old?.id === "string" ? change.old.id : null;
    if (!removedId) return votes as XYIndividualVote[];

    const next = votes.filter((v) => v.id !== removedId);
    return next.length === votes.length ? (votes as XYIndividualVote[]) : next;
  }

  const vote = normalizeXyIndividualVoteRow(change.new ?? {});
  if (!vote.id) return votes as XYIndividualVote[];

  // Rows from a previous session must never leak into the live counter.
  if (vote.session_id && vote.session_id !== sessionId) {
    return votes as XYIndividualVote[];
  }

  // Prefer matching by primary key; fall back to the unique (round, player) key
  // so a re-cast that somehow arrives with a new id still replaces the old row.
  const existingIndex = votes.findIndex(
    (v) =>
      v.id === vote.id ||
      (v.player_id === vote.player_id && v.round_number === vote.round_number)
  );

  if (existingIndex >= 0) {
    const existing = votes[existingIndex];
    if (
      existing &&
      existing.id === vote.id &&
      existing.vote === vote.vote &&
      existing.edited_by_mentor === vote.edited_by_mentor &&
      existing.edited_at === vote.edited_at &&
      existing.round_number === vote.round_number &&
      existing.player_id === vote.player_id
    ) {
      return votes as XYIndividualVote[];
    }

    const next = [...votes];
    next[existingIndex] = { ...existing, ...vote };
    return next;
  }

  return [...votes, vote].sort(
    (a, b) =>
      a.player_id.localeCompare(b.player_id) || a.round_number - b.round_number
  );
}
