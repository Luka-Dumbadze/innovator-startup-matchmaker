"use server";

import { revalidatePath } from "next/cache";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { fetchXySnapshot } from "@/lib/supabase/xy-client";
import { XY_DEFAULT_TEAMS, parseXYVote, scoreRoundForTeams } from "@/lib/xy/scoring";
import {
  XY_STATUS_ACTIVE,
  xySessionEndPatch,
  xySessionStartPatch,
} from "@/lib/xy/session-state";
import type { XYSnapshot, XYVote } from "@/types/xy";

export type XYActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateXyRoutes(): void {
  revalidatePath("/admin/xy");
  revalidatePath("/xy");
  revalidatePath("/xy/scoreboard");
  revalidatePath("/xy/analytics");
}

/** Server-side snapshot for the mentor panel's initial render. */
export async function getXySnapshot(): Promise<XYSnapshot> {
  return fetchXySnapshot(createAdminSupabaseClient());
}

/** Deactivate any live XY session, then create a fresh one with 8 named teams. */
export async function createXySessionAction(
  label: string
): Promise<XYActionResult<{ sessionId: string }>> {
  try {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      return { ok: false, error: "სესიის სახელი აუცილებელია" };
    }

    const supabase = createAdminSupabaseClient();

    const { error: deactivateError } = await supabase
      .from("xy_sessions")
      .update(xySessionEndPatch())
      .eq("is_active", true)
      .eq("status", XY_STATUS_ACTIVE);

    if (deactivateError) {
      return { ok: false, error: deactivateError.message };
    }

    const { data: session, error: sessionError } = await supabase
      .from("xy_sessions")
      .insert({
        label: cleanLabel,
        ...xySessionStartPatch(),
        current_round: 1,
        voting_open: false,
      })
      .select("*")
      .maybeSingle();

    if (sessionError || !session) {
      return { ok: false, error: sessionError?.message ?? "სესია ვერ შეიქმნა" };
    }

    const { error: teamsError } = await supabase.from("xy_teams").insert(
      XY_DEFAULT_TEAMS.map((team, index) => ({
        session_id: session.id,
        team_number: index + 1,
        name: team.name,
        color: team.color,
      }))
    );

    if (teamsError) {
      await supabase.from("xy_sessions").delete().eq("id", session.id);
      return { ok: false, error: `გუნდები ვერ შეიქმნა: ${teamsError.message}` };
    }

    revalidateXyRoutes();
    return { ok: true, data: { sessionId: session.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}

export async function renameXyTeamAction(
  teamId: string,
  name: string
): Promise<XYActionResult> {
  try {
    const cleanName = name.trim();
    if (!teamId || !cleanName) {
      return { ok: false, error: "გუნდის სახელი აუცილებელია" };
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("xy_teams")
      .update({ name: cleanName })
      .eq("id", teamId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateXyRoutes();
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}

/** Mentor assigns (or clears) a student's team. */
export async function assignXyPlayerTeamAction(
  playerId: string,
  teamId: string | null
): Promise<XYActionResult> {
  try {
    if (!playerId) {
      return { ok: false, error: "playerId აუცილებელია" };
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("xy_players")
      .update({ team_id: teamId })
      .eq("id", playerId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateXyRoutes();
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}

/**
 * Open or close the current round. No timers — the mentor is the only trigger.
 * Opening also sets which round number students are voting on.
 */
export async function setXyRoundStateAction(input: {
  sessionId: string;
  round: number;
  votingOpen: boolean;
}): Promise<XYActionResult<{ round: number; votingOpen: boolean }>> {
  try {
    if (!input.sessionId) {
      return { ok: false, error: "sessionId აუცილებელია" };
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      return { ok: false, error: "რაუნდის ნომერი არავალიდურია" };
    }

    // Only a live session may open or close rounds, so both liveness flags are
    // part of the WHERE clause rather than trusted from the client.
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("xy_sessions")
      .update({ current_round: input.round, voting_open: input.votingOpen })
      .eq("id", input.sessionId)
      .eq("is_active", true)
      .eq("status", XY_STATUS_ACTIVE)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: false, error: "XY სესია აქტიური არ არის — შექმენით ახალი" };
    }

    revalidateXyRoutes();
    return { ok: true, data: { round: input.round, votingOpen: input.votingOpen } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}

/**
 * Save the 8 team paper votes for one round and recompute every team's points.
 *
 * Points are always derived from the full round, so editing a single past
 * decision re-scores the whole round rather than leaving stale values.
 */
export async function saveXyTeamRoundVotesAction(input: {
  sessionId: string;
  round: number;
  votes: { teamId: string; vote: string | null }[];
}): Promise<XYActionResult<{ scored: number; complete: boolean }>> {
  try {
    if (!input.sessionId) {
      return { ok: false, error: "sessionId აუცილებელია" };
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      return { ok: false, error: "რაუნდის ნომერი არავალიდურია" };
    }

    const supabase = createAdminSupabaseClient();

    const entries: { teamId: string; vote: XYVote }[] = [];
    const clearedTeamIds: string[] = [];

    for (const entry of input.votes) {
      if (!entry.teamId) continue;
      const parsed = parseXYVote(entry.vote);
      if (parsed) {
        entries.push({ teamId: entry.teamId, vote: parsed });
      } else {
        clearedTeamIds.push(entry.teamId);
      }
    }

    if (clearedTeamIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("xy_team_votes")
        .delete()
        .eq("session_id", input.sessionId)
        .eq("round_number", input.round)
        .in("team_id", clearedTeamIds);

      if (deleteError) {
        return { ok: false, error: deleteError.message };
      }
    }

    const { round, results } = scoreRoundForTeams(entries);

    if (results.length > 0) {
      const { error: upsertError } = await supabase.from("xy_team_votes").upsert(
        results.map((r) => ({
          session_id: input.sessionId,
          round_number: input.round,
          team_id: r.teamId,
          vote: r.vote,
          points: r.points,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "session_id,round_number,team_id" }
      );

      if (upsertError) {
        return { ok: false, error: upsertError.message };
      }
    }

    revalidateXyRoutes();
    return { ok: true, data: { scored: results.length, complete: round.complete } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}

/**
 * Mentor override of a single student's phone vote for any round
 * (including closed ones). Passing `null` clears the vote.
 */
export async function overrideXyIndividualVoteAction(input: {
  sessionId: string;
  round: number;
  playerId: string;
  vote: string | null;
}): Promise<XYActionResult> {
  try {
    if (!input.sessionId || !input.playerId) {
      return { ok: false, error: "sessionId და playerId აუცილებელია" };
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      return { ok: false, error: "რაუნდის ნომერი არავალიდურია" };
    }

    const supabase = createAdminSupabaseClient();
    const parsed = parseXYVote(input.vote);

    if (!parsed) {
      const { error } = await supabase
        .from("xy_individual_votes")
        .delete()
        .eq("session_id", input.sessionId)
        .eq("round_number", input.round)
        .eq("player_id", input.playerId);

      if (error) {
        return { ok: false, error: error.message };
      }

      revalidateXyRoutes();
      return { ok: true, data: undefined };
    }

    const { error } = await supabase.from("xy_individual_votes").upsert(
      {
        session_id: input.sessionId,
        round_number: input.round,
        player_id: input.playerId,
        vote: parsed,
        edited_by_mentor: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,round_number,player_id" }
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateXyRoutes();
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}

/** Close the XY session (keeps all data for analytics / export). */
export async function endXySessionAction(
  sessionId: string
): Promise<XYActionResult> {
  try {
    if (!sessionId) {
      return { ok: false, error: "sessionId აუცილებელია" };
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("xy_sessions")
      .update({ ...xySessionEndPatch(), voting_open: false })
      .eq("id", sessionId)
      .eq("is_active", true)
      .eq("status", XY_STATUS_ACTIVE);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateXyRoutes();
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}
