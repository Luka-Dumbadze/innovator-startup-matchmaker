"use server";

import { revalidatePath } from "next/cache";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { fetchXySnapshot } from "@/lib/supabase/xy-client";
import { XY_DEFAULT_TEAMS, parseXYVote, scoreRoundForTeams } from "@/lib/xy/scoring";
import {
  XY_STATUS_ACTIVE,
  resolveXySessionLabel,
  xySessionEndPatch,
} from "@/lib/xy/session-state";
import type { XYSnapshot, XYVote } from "@/types/xy";

export type XYActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Every mentor mutation runs through the service-role client: the XY tables are
 * public-read with no auth, so RLS would otherwise reject these writes.
 */
function getSupabaseServerAdminClient() {
  return createAdminSupabaseClient();
}

function revalidateXyRoutes(): void {
  revalidatePath("/admin/xy");
  revalidatePath("/xy");
  revalidatePath("/xy/scoreboard");
  revalidatePath("/xy/analytics");
}

/** Server-side snapshot for the mentor panel's initial render. */
export async function getXySnapshot(): Promise<XYSnapshot> {
  return fetchXySnapshot(getSupabaseServerAdminClient());
}

/**
 * Deactivate any live XY session, then create a fresh one with 8 named teams.
 *
 * The session and its teams are created as a unit: if the team insert fails the
 * session row is removed again, so the mentor never lands on a half-built
 * session that renders as "no active session".
 */
export async function createXySessionAction(
  label: string
): Promise<XYActionResult<{ sessionId: string; label: string }>> {
  try {
    // A blank name falls back to the same value as the column default.
    const resolvedLabel = resolveXySessionLabel(label);
    const supabase = getSupabaseServerAdminClient();

    const { error: deactivateError } = await supabase
      .from("xy_sessions")
      .update(xySessionEndPatch())
      .eq("is_active", true)
      .eq("status", XY_STATUS_ACTIVE);

    if (deactivateError) {
      return {
        success: false,
        error: `არსებული სესია ვერ დაიხურა: ${deactivateError.message}`,
      };
    }

    const { data: session, error: sessionError } = await supabase
      .from("xy_sessions")
      .insert({
        label: resolvedLabel,
        is_active: true,
        status: XY_STATUS_ACTIVE,
        current_round: 1,
        voting_open: false,
        ended_at: null,
      })
      .select("*")
      .maybeSingle();

    if (sessionError || !session) {
      return {
        success: false,
        error: sessionError?.message ?? "სესია ვერ შეიქმნა (insert returned no row)",
      };
    }

    const { data: teams, error: teamsError } = await supabase
      .from("xy_teams")
      .insert(
        XY_DEFAULT_TEAMS.map((team, index) => ({
          session_id: session.id,
          team_number: index + 1,
          name: team.name,
          color: team.color,
        }))
      )
      .select("id");

    const createdTeams = teams?.length ?? 0;

    if (teamsError || createdTeams !== XY_DEFAULT_TEAMS.length) {
      await supabase.from("xy_sessions").delete().eq("id", session.id);
      return {
        success: false,
        error: teamsError
          ? `გუნდები ვერ შეიქმნა: ${teamsError.message}`
          : `გუნდები ვერ შეიქმნა: ${createdTeams}/${XY_DEFAULT_TEAMS.length} ჩაიწერა`,
      };
    }

    revalidateXyRoutes();
    return {
      success: true,
      data: { sessionId: session.id, label: resolvedLabel },
    };
  } catch (err) {
    return {
      success: false,
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
      return { success: false, error: "გუნდის სახელი აუცილებელია" };
    }

    const supabase = getSupabaseServerAdminClient();
    const { error } = await supabase
      .from("xy_teams")
      .update({ name: cleanName })
      .eq("id", teamId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateXyRoutes();
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
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
      return { success: false, error: "playerId აუცილებელია" };
    }

    const supabase = getSupabaseServerAdminClient();
    const { error } = await supabase
      .from("xy_players")
      .update({ team_id: teamId })
      .eq("id", playerId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateXyRoutes();
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
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
      return { success: false, error: "sessionId აუცილებელია" };
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      return { success: false, error: "რაუნდის ნომერი არავალიდურია" };
    }

    // Only a live session may open or close rounds, so both liveness flags are
    // part of the WHERE clause rather than trusted from the client.
    const supabase = getSupabaseServerAdminClient();
    const { data, error } = await supabase
      .from("xy_sessions")
      .update({ current_round: input.round, voting_open: input.votingOpen })
      .eq("id", input.sessionId)
      .eq("is_active", true)
      .eq("status", XY_STATUS_ACTIVE)
      .select("id")
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "XY სესია აქტიური არ არის — შექმენით ახალი" };
    }

    revalidateXyRoutes();
    return { success: true, data: { round: input.round, votingOpen: input.votingOpen } };
  } catch (err) {
    return {
      success: false,
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
      return { success: false, error: "sessionId აუცილებელია" };
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      return { success: false, error: "რაუნდის ნომერი არავალიდურია" };
    }

    const supabase = getSupabaseServerAdminClient();

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
        return { success: false, error: deleteError.message };
      }
    }

    const { round, results } = scoreRoundForTeams(entries);

    if (results.length > 0) {
      // team_number / team_name / points_awarded are filled in by the table's
      // sync trigger, which also resolves rows written by team number.
      const { error: upsertError } = await supabase.from("xy_team_votes").upsert(
        results.map((r) => ({
          session_id: input.sessionId,
          round_number: input.round,
          team_id: r.teamId,
          vote: r.vote,
          points: r.points,
          points_awarded: r.points,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "session_id,round_number,team_id" }
      );

      if (upsertError) {
        return { success: false, error: upsertError.message };
      }
    }

    revalidateXyRoutes();
    return { success: true, data: { scored: results.length, complete: round.complete } };
  } catch (err) {
    return {
      success: false,
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
      return { success: false, error: "sessionId და playerId აუცილებელია" };
    }
    if (!Number.isInteger(input.round) || input.round < 1) {
      return { success: false, error: "რაუნდის ნომერი არავალიდურია" };
    }

    const supabase = getSupabaseServerAdminClient();
    const parsed = parseXYVote(input.vote);

    if (!parsed) {
      const { error } = await supabase
        .from("xy_individual_votes")
        .delete()
        .eq("session_id", input.sessionId)
        .eq("round_number", input.round)
        .eq("player_id", input.playerId);

      if (error) {
        return { success: false, error: error.message };
      }

      revalidateXyRoutes();
      return { success: true, data: undefined };
    }

    const editedAt = new Date().toISOString();
    const { error } = await supabase.from("xy_individual_votes").upsert(
      {
        session_id: input.sessionId,
        round_number: input.round,
        player_id: input.playerId,
        vote: parsed,
        edited_by_mentor: true,
        edited_at: editedAt,
        updated_at: editedAt,
      },
      { onConflict: "session_id,round_number,player_id" }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateXyRoutes();
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
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
      return { success: false, error: "sessionId აუცილებელია" };
    }

    const supabase = getSupabaseServerAdminClient();
    const { error } = await supabase
      .from("xy_sessions")
      .update({ ...xySessionEndPatch(), voting_open: false })
      .eq("id", sessionId)
      .eq("is_active", true)
      .eq("status", XY_STATUS_ACTIVE);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateXyRoutes();
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "მოულოდნელი შეცდომა",
    };
  }
}
