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

/**
 * `player_id` is the FK to xy_players.id and is always read back explicitly.
 * The mentor-edit audit pair is optional at the database level, so the reader
 * below falls back to a wildcard select when a column is not there yet.
 */
export const XY_INDIVIDUAL_VOTE_COLUMNS =
  "id, session_id, round_number, player_id, vote, edited_by_mentor, edited_at";

export const XY_TEAM_VOTE_COLUMNS =
  "id, session_id, round_number, team_id, vote, points";

export const EMPTY_XY_SNAPSHOT: XYSnapshot = {
  session: null,
  teams: [],
  players: [],
  individualVotes: [],
  teamVotes: [],
};

type ListResult = {
  data: unknown[] | null;
  error: { message: string; code?: string } | null;
};

type NormalizedList<T> = { data: T[]; error: { message: string } | null };

/**
 * Reads rows by explicit column list, retrying with a wildcard select when the
 * database is missing one of those columns, then normalizes every row. Columns
 * are added across migrations, so a query must never be the reason a screen
 * fails to load.
 */
async function selectRows<T>(
  explicit: () => PromiseLike<ListResult>,
  wildcard: () => PromiseLike<ListResult>,
  normalize: (row: Record<string, unknown>) => T
): Promise<NormalizedList<T>> {
  const primary = await explicit();
  const result =
    primary.error?.code === UNDEFINED_COLUMN ? await wildcard() : primary;

  if (result.error) {
    return { data: [], error: result.error };
  }

  return {
    data: (result.data ?? []).map((row) =>
      normalize((row ?? {}) as Record<string, unknown>)
    ),
    error: null,
  };
}

/** Roster read that survives a table holding only one of the two name columns. */
function fetchXyPlayers(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<NormalizedList<XYPlayer>> {
  const query = (columns: string) =>
    supabase
      .from("xy_players")
      .select(columns)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

  return selectRows(
    () => query(XY_PLAYER_COLUMNS),
    () => query("*"),
    (row) => {
      const player = row as unknown as XYPlayer;
      const name = resolveXyPlayerName(player);
      return { ...player, full_name: name, real_name: name };
    }
  );
}

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

/** Vote read that tolerates a table without the mentor-edit audit columns. */
function fetchXyIndividualVotes(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<NormalizedList<XYIndividualVote>> {
  const query = (columns: string) =>
    supabase
      .from("xy_individual_votes")
      .select(columns)
      .eq("session_id", sessionId)
      .order("player_id", { ascending: true });

  return selectRows(
    () => query(XY_INDIVIDUAL_VOTE_COLUMNS),
    () => query("*"),
    normalizeXyIndividualVoteRow
  );
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
    fetchXyIndividualVotes(supabase, session.id),
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
    players: playersRes.data,
    individualVotes: individualRes.data,
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
