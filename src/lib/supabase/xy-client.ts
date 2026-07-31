import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import { XY_STATUS_ACTIVE, isXySessionLive } from "@/lib/xy/session-state";
import type {
  XYIndividualVote,
  XYPlayer,
  XYSession,
  XYSnapshot,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";

/**
 * Newest live XY session. Both liveness flags are filtered explicitly, and
 * `.maybeSingle()` (never `.single()`) keeps duplicates from crashing reads.
 */
export async function fetchActiveXySession(
  supabase: SupabaseClient<Database>
): Promise<XYSession | null> {
  const { data, error } = await supabase
    .from("xy_sessions")
    .select("*")
    .eq("is_active", true)
    .eq("status", XY_STATUS_ACTIVE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return isXySessionLive(data) ? data : null;
}

export const EMPTY_XY_SNAPSHOT: XYSnapshot = {
  session: null,
  teams: [],
  players: [],
  individualVotes: [],
  teamVotes: [],
};

/** One read powering the student, mentor, scoreboard and analytics screens. */
export async function fetchXySnapshot(
  supabase: SupabaseClient<Database>
): Promise<XYSnapshot> {
  const session = await fetchActiveXySession(supabase);
  if (!session) {
    return { ...EMPTY_XY_SNAPSHOT };
  }

  const [teamsRes, playersRes, individualRes, teamVotesRes] = await Promise.all([
    supabase
      .from("xy_teams")
      .select("*")
      .eq("session_id", session.id)
      .order("team_number", { ascending: true }),
    supabase
      .from("xy_players")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("xy_individual_votes")
      .select("id, session_id, round_number, player_id, vote, edited_by_mentor")
      .eq("session_id", session.id),
    supabase
      .from("xy_team_votes")
      .select("id, session_id, round_number, team_id, vote, points")
      .eq("session_id", session.id),
  ]);

  const firstError =
    teamsRes.error ?? playersRes.error ?? individualRes.error ?? teamVotesRes.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    session,
    teams: (teamsRes.data ?? []) as XYTeam[],
    players: (playersRes.data ?? []) as XYPlayer[],
    individualVotes: (individualRes.data ?? []) as XYIndividualVote[],
    teamVotes: (teamVotesRes.data ?? []) as XYTeamVote[],
  };
}

/** Idempotent roster join keyed by device uid. */
export async function xyJoinPlayer(
  supabase: SupabaseClient<Database>,
  input: { sessionId: string; playerUid: string; fullName: string }
): Promise<XYPlayer> {
  const { data, error } = await supabase.rpc("xy_join_player", {
    p_session_id: input.sessionId,
    p_player_uid: input.playerUid,
    p_full_name: input.fullName,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("xy_join_player returned no player");
  }

  return data as XYPlayer;
}

/** Cast / change the student's phone vote for the currently open round. */
export async function xyCastIndividualVote(
  supabase: SupabaseClient<Database>,
  input: { sessionId: string; playerUid: string; vote: XYVote }
): Promise<{ round_number: number; vote: XYVote }> {
  const { data, error } = await supabase.rpc("xy_cast_individual_vote", {
    p_session_id: input.sessionId,
    p_player_uid: input.playerUid,
    p_vote: input.vote,
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = data as { round_number?: number; vote?: string } | null;
  return {
    round_number: Number(raw?.round_number ?? 0),
    vote: raw?.vote === "X" ? "X" : "Y",
  };
}

export const XY_TABLES = [
  "xy_sessions",
  "xy_teams",
  "xy_players",
  "xy_individual_votes",
  "xy_team_votes",
] as const;
