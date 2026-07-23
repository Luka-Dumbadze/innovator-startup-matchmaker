/**
 * Core domain types for Startup Matchmaker.
 *
 * Daily flow: mentors activate one DailySession → 8 Teams
 * (1 target domain + 3 keywords each) → up to 40 students join via QR
 * and are atomically assigned to an open slot.
 */

/** One morning's matchmaking window. Only one session should be active at a time. */
export interface DailySession {
  id: string;
  date_label: string;
  is_active: boolean;
  created_at: string;
}

/**
 * A team within a daily session.
 *
 * `current_count` is denormalized capacity state maintained exclusively by
 * `assign_player_atomically` under row-level locks — never increment from the app.
 */
export interface Team {
  id: string;
  session_id: string;
  team_number: number;
  name: string;
  color: string;
  /** Target industry / sector for ideation (Georgian label). */
  domain: string;
  /** Exactly three keywords shown to students on that team. */
  words: string[];
  max_capacity: number;
  current_count: number;
}

/** Immutable record of a student landing on a team for a given session. */
export interface PlayerAssignment {
  id: string;
  session_id: string;
  team_id: string;
  player_uid: string;
  joined_at: string;
}

/** Payload returned by the `assign_player_atomically` RPC. */
export type AssignPlayerResult = Team;

/** Args for the atomic assignment RPC. */
export interface AssignPlayerParams {
  p_session_id: string;
  p_player_uid: string;
}
