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
  /** Set when mentor ends the session; null while still open. */
  ended_at: string | null;
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
  /** Global Human Challenge for ideation (Georgian label). */
  domain: string;
  /** Exactly three structured tools: Physical · Tech · Environment. */
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
  real_name: string;
  nickname: string;
  joined_at: string;
}

/** Structured solo / team idea micro-form (≤140 chars per field). */
export interface IdeaNotes {
  startupName: string;
  oneSentenceSolution: string;
  toolsIntegration: string;
}

/** Shared teammate idea payload on the team realtime channel. */
export interface SharedTeamIdea {
  playerUid: string;
  nickname: string;
  startupName: string;
  oneSentenceSolution: string;
  toolsIntegration: string;
  updatedAt: string;
}

export interface SubmittedIdea {
  id: string;
  session_id: string;
  team_id: string;
  author_player_uid: string;
  author_real_name: string;
  author_nickname: string;
  startup_name: string;
  one_sentence_solution: string;
  tools_integration: string;
  is_final_team_pitch: boolean;
  likes_count: number;
  dislikes_count: number;
  created_at: string;
}

/** Student onboarding profile (persisted locally + stored on assignment). */
export interface PlayerProfile {
  realName: string;
  nickname: string;
}

/** Payload returned by the `assign_player_atomically` RPC. */
export type AssignPlayerResult = Team;

/** Args for the atomic assignment RPC. */
export interface AssignPlayerParams {
  p_session_id: string;
  p_player_uid: string;
  p_real_name: string;
  p_nickname: string;
}
