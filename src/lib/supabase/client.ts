import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { toTeam, type AssignPlayerParams, type AssignPlayerResult, type Database } from "./types";
import type { IdeaNotes } from "@/types/game";

/**
 * Browser Supabase client (singleton).
 *
 * Use in Client Components for realtime subscriptions and RPC calls such as
 * `assign_player_atomically`. Prefer the server client in Server Components /
 * Route Handlers so cookies and secrets stay off the client bundle path.
 */
let browserClient: SupabaseClient<Database> | undefined;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example → .env.local."
    );
  }

  browserClient = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return browserClient;
}

/**
 * Atomically assign the current student to an open team slot.
 * Backed by Postgres FOR UPDATE locking — safe under 40 concurrent QR scans.
 */
export async function assignPlayerAtomically(
  params: AssignPlayerParams
): Promise<AssignPlayerResult> {
  const supabase = createBrowserSupabaseClient();

  const { data, error } = await supabase.rpc("assign_player_atomically", {
    p_session_id: params.p_session_id,
    p_player_uid: params.p_player_uid,
    p_real_name: params.p_real_name,
    p_nickname: params.p_nickname,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("assign_player_atomically returned no team");
  }

  return toTeam(data);
}

/** Upsert the team's final pitch at the end of the 12-minute flow. */
export async function submitFinalTeamPitch(input: {
  sessionId: string;
  teamId: string;
  playerUid: string;
  realName: string;
  nickname: string;
  notes: IdeaNotes;
}): Promise<void> {
  const supabase = createBrowserSupabaseClient();

  const row = {
    session_id: input.sessionId,
    team_id: input.teamId,
    author_player_uid: input.playerUid,
    author_real_name: input.realName.trim(),
    author_nickname: input.nickname.trim(),
    startup_name: input.notes.startupName.trim() || "Untitled Startup",
    one_sentence_solution: input.notes.oneSentenceSolution.trim() || "—",
    tools_integration: input.notes.toolsIntegration.trim() || "—",
    is_final_team_pitch: true,
  };

  // Prefer update of existing final pitch for this team; otherwise insert.
  const { data: existing, error: lookupError } = await supabase
    .from("submitted_ideas")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("team_id", input.teamId)
    .eq("is_final_team_pitch", true)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("submitted_ideas")
      .update(row)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("submitted_ideas").insert(row);
  if (error) throw new Error(error.message);
}

export type PitchVoteType = "like" | "dislike";

export type CastPitchVoteResult = {
  likes_count: number;
  dislikes_count: number;
  vote_type: PitchVoteType;
};

/** Cast (or change) an audience like/dislike for a team's pitch. */
export async function castPitchVote(input: {
  sessionId: string;
  teamId: string;
  voterUid: string;
  voteType: PitchVoteType;
}): Promise<CastPitchVoteResult> {
  const supabase = createBrowserSupabaseClient();

  const { data, error } = await supabase.rpc("cast_pitch_vote", {
    p_session_id: input.sessionId,
    p_team_id: input.teamId,
    p_voter_uid: input.voterUid,
    p_vote_type: input.voteType,
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = data as {
    likes_count?: number;
    dislikes_count?: number;
    vote_type?: string;
  } | null;

  return {
    likes_count: Number(raw?.likes_count ?? 0),
    dislikes_count: Number(raw?.dislikes_count ?? 0),
    vote_type: raw?.vote_type === "dislike" ? "dislike" : "like",
  };
}
