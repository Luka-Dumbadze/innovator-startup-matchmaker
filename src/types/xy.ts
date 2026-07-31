/**
 * Standalone XY-Game (Win-Win Simulation) domain types.
 *
 * Two parallel decision channels per round:
 * - Team paper vote (mentor entered) → drives team scores.
 * - Individual phone vote (student tap) → private, used for defection analytics.
 */

export type XYVote = "X" | "Y";

/** Session lifecycle, always kept in lockstep with `is_active`. */
export type XYSessionStatus = "active" | "completed";

export interface XYSession {
  id: string;
  /** Mentor-facing session name; never blank (DB default: `XY თამაში`). */
  label: string;
  is_active: boolean;
  status: XYSessionStatus;
  current_round: number;
  voting_open: boolean;
  created_at: string;
  ended_at: string | null;
}

export interface XYTeam {
  id: string;
  session_id: string;
  team_number: number;
  name: string;
  color: string;
}

export interface XYPlayer {
  id: string;
  session_id: string;
  player_uid: string;
  full_name: string;
  team_id: string | null;
  created_at: string;
}

export interface XYIndividualVote {
  id: string;
  session_id: string;
  round_number: number;
  player_id: string;
  vote: XYVote;
  edited_by_mentor: boolean;
}

export interface XYTeamVote {
  id: string;
  session_id: string;
  round_number: number;
  team_id: string;
  vote: XYVote;
  points: number;
}

/** Everything the XY screens need in one read. */
export interface XYSnapshot {
  session: XYSession | null;
  teams: XYTeam[];
  players: XYPlayer[];
  individualVotes: XYIndividualVote[];
  teamVotes: XYTeamVote[];
}

/** Defection classification comparing team paper vote vs student phone vote. */
export type XYAlignment =
  | "stealth_defector"
  | "secret_altruist"
  | "aligned"
  | "incomplete";
