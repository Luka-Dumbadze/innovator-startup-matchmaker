import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import {
  XY_STATUS_ACTIVE,
  XY_STATUS_COMPLETED,
  isXySessionLive,
  parseXySessionStatus,
  resolveXySessionLabel,
} from "@/lib/xy/session-state";
import { resolveXyPlayerName } from "@/lib/xy/roster";
import type {
  XYIndividualVote,
  XYPlayer,
  XYSession,
  XYSnapshot,
  XYTeam,
  XYTeamVote,
  XYVote,
} from "@/types/xy";

/** PostgREST code for "column does not exist" — a DB that predates a migration. */
const UNDEFINED_COLUMN = "42703";

/**
 * Fills in whichever liveness flag a row is missing, so a database created
 * before `status` existed still yields a usable session. Rows where both flags
 * are present but disagree are left untouched for `isXySessionLive` to reject.
 */
export function normalizeXySessionRow(row: unknown): XYSession | null {
  if (!row || typeof row !== "object") return null;

  const raw = row as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id) return null;

  const parsedStatus = parseXySessionStatus(raw.status);
  const isActive =
    typeof raw.is_active === "boolean"
      ? raw.is_active
      : parsedStatus !== XY_STATUS_COMPLETED;

  return {
    id: raw.id,
    label: resolveXySessionLabel(
      typeof raw.label === "string" ? raw.label : null
    ),
    is_active: isActive,
    status: parsedStatus ?? (isActive ? XY_STATUS_ACTIVE : XY_STATUS_COMPLETED),
    current_round:
      typeof raw.current_round === "number" && raw.current_round >= 1
        ? raw.current_round
        : 1,
    voting_open: raw.voting_open === true,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    ended_at: typeof raw.ended_at === "string" ? raw.ended_at : null,
  };
}

type SessionQueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

function resolveSessionQuery(result: SessionQueryResult): XYSession | null {
  if (result.error) {
    // The column is absent on this database; the other lookup still applies.
    if (result.error.code === UNDEFINED_COLUMN) return null;
    throw new Error(result.error.message);
  }

  const session = normalizeXySessionRow(result.data);
  return session && isXySessionLive(session) ? session : null;
}

/**
 * Newest live XY session.
 *
 * `is_active` is the primary flag; if nothing matches (or the column predates
 * this schema) the same lookup is retried against `status`, so a half-migrated
 * database still finds its session instead of rendering "no active session".
 * Always `.maybeSingle()` so duplicate live rows cannot crash the read.
 */
export async function fetchActiveXySession(
  supabase: SupabaseClient<Database>
): Promise<XYSession | null> {
  const byIsActive = resolveSessionQuery(
    await supabase
      .from("xy_sessions")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  if (byIsActive) return byIsActive;

  return resolveSessionQuery(
    await supabase
      .from("xy_sessions")
      .select("*")
      .eq("status", XY_STATUS_ACTIVE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
}

export const XY_TEAM_COLUMNS = "id, session_id, team_number, name, color, created_at";

/** Both name columns are read so either spelling can satisfy the UI. */
export const XY_PLAYER_COLUMNS =
  "id, session_id, player_uid, full_name, real_name, team_id, created_at";

/** `player_id` is the FK to xy_players.id and is always read back explicitly. */
export const XY_INDIVIDUAL_VOTE_COLUMNS =
  "id, session_id, round_number, player_id, vote, edited_by_mentor";

export const XY_TEAM_VOTE_COLUMNS =
  "id, session_id, round_number, team_id, vote, points";

export const EMPTY_XY_SNAPSHOT: XYSnapshot = {
  session: null,
  teams: [],
  players: [],
  individualVotes: [],
  teamVotes: [],
};

/**
 * Roster read that survives a database holding only one of the two name
 * columns: the explicit list is tried first, then a wildcard select, and the
 * missing side is filled in from whichever name did come back.
 */
async function fetchXyPlayers(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<{ data: XYPlayer[] | null; error: { message: string } | null }> {
  const explicit = await supabase
    .from("xy_players")
    .select(XY_PLAYER_COLUMNS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const rows =
    explicit.error?.code === UNDEFINED_COLUMN
      ? await supabase
          .from("xy_players")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
      : explicit;

  if (rows.error) {
    return { data: null, error: rows.error };
  }

  const players = ((rows.data ?? []) as XYPlayer[]).map((player) => {
    const name = resolveXyPlayerName(player);
    return { ...player, full_name: name, real_name: name };
  });

  return { data: players, error: null };
}

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
      .select(XY_TEAM_COLUMNS)
      .eq("session_id", session.id)
      .order("team_number", { ascending: true }),
    fetchXyPlayers(supabase, session.id),
    supabase
      .from("xy_individual_votes")
      .select(XY_INDIVIDUAL_VOTE_COLUMNS)
      .eq("session_id", session.id)
      .order("player_id", { ascending: true }),
    supabase
      .from("xy_team_votes")
      .select(XY_TEAM_VOTE_COLUMNS)
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

  const player = data as XYPlayer;
  const name = resolveXyPlayerName(player);
  return { ...player, full_name: name, real_name: name };
}

/** Cast / change the student's phone vote for the currently open round. */
export async function xyCastIndividualVote(
  supabase: SupabaseClient<Database>,
  input: { sessionId: string; playerUid: string; vote: XYVote }
): Promise<{ round_number: number; player_id: string; vote: XYVote }> {
  const { data, error } = await supabase.rpc("xy_cast_individual_vote", {
    p_session_id: input.sessionId,
    p_player_uid: input.playerUid,
    p_vote: input.vote,
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = data as
    | { round_number?: number; player_id?: string; vote?: string }
    | null;

  return {
    round_number: Number(raw?.round_number ?? 0),
    player_id: raw?.player_id ?? "",
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
