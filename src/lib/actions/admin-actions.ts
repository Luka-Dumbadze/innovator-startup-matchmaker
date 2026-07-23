"use server";

import { revalidatePath } from "next/cache";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { DailySession, Team } from "@/types/game";

export type TeamDraftInput = {
  teamNumber: number;
  name: string;
  color: string;
  domain: string;
  words: string[];
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ActiveSessionSnapshot = {
  session: DailySession;
  teams: Team[];
  totalJoined: number;
};

function asThreeWords(words: string[]): string[] {
  const trimmed = words.map((w) => w.trim()).filter(Boolean);
  if (trimmed.length !== 3) {
    throw new Error("Each team must have exactly 3 non-empty keywords");
  }
  return trimmed;
}

function mapTeam(row: {
  id: string;
  session_id: string;
  team_number: number;
  name: string;
  color: string;
  domain?: string | null;
  words: string[];
  max_capacity: number;
  current_count: number;
}): Team {
  return {
    id: row.id,
    session_id: row.session_id,
    team_number: row.team_number,
    name: row.name,
    color: row.color,
    domain: (row.domain ?? "").trim(),
    words: asThreeWords(row.words),
    max_capacity: row.max_capacity,
    current_count: row.current_count,
  };
}

function validateTeams(teams: TeamDraftInput[]): void {
  if (teams.length !== 8) {
    throw new Error("Exactly 8 teams are required");
  }

  const numbers = new Set(teams.map((t) => t.teamNumber));
  for (let n = 1; n <= 8; n += 1) {
    if (!numbers.has(n)) {
      throw new Error(`Missing team_number ${n}`);
    }
  }

  for (const team of teams) {
    if (!team.name.trim()) {
      throw new Error(`Team ${team.teamNumber} needs a name`);
    }
    if (!team.domain.trim()) {
      throw new Error(`Team ${team.teamNumber} needs a target domain`);
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(team.color)) {
      throw new Error(`Team ${team.teamNumber} color must be a hex like #2563EB`);
    }
    asThreeWords(team.words);
  }
}

async function deactivateAllSessions(): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("daily_sessions")
    .update({ is_active: false })
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to deactivate sessions: ${error.message}`);
  }
}

/**
 * Deactivate any live session, then create + activate a new one with 8 teams.
 */
export async function createAndActivateSession(
  dateLabel: string,
  teams: TeamDraftInput[]
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const label = dateLabel.trim();
    if (!label) {
      return { ok: false, error: "Session label is required" };
    }

    validateTeams(teams);

    const supabase = createAdminSupabaseClient();

    // Unique partial index allows only one is_active=true — clear first.
    await deactivateAllSessions();

    const { data: session, error: sessionError } = await supabase
      .from("daily_sessions")
      .insert({ date_label: label, is_active: true })
      .select("*")
      .single();

    if (sessionError || !session) {
      return {
        ok: false,
        error: sessionError?.message ?? "Failed to create daily session",
      };
    }

    const teamRows = teams
      .slice()
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .map((team) => ({
        session_id: session.id,
        team_number: team.teamNumber,
        name: team.name.trim(),
        color: team.color,
        domain: team.domain.trim(),
        words: asThreeWords(team.words),
        max_capacity: 5,
        current_count: 0,
      }));

    const { error: teamsError } = await supabase.from("teams").insert(teamRows);

    if (teamsError) {
      // Roll back orphan session (teams cascade would not apply — none inserted).
      await supabase.from("daily_sessions").delete().eq("id", session.id);
      return { ok: false, error: `Failed to insert teams: ${teamsError.message}` };
    }

    revalidatePath("/admin");
    return { ok: true, data: { sessionId: session.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error creating session",
    };
  }
}

/**
 * Make `sessionId` the sole active daily session.
 */
export async function activateSession(
  sessionId: string
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    if (!sessionId) {
      return { ok: false, error: "sessionId is required" };
    }

    const supabase = createAdminSupabaseClient();

    const { data: existing, error: lookupError } = await supabase
      .from("daily_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();

    if (lookupError) {
      return { ok: false, error: lookupError.message };
    }
    if (!existing) {
      return { ok: false, error: "Session not found" };
    }

    await deactivateAllSessions();

    const { error: activateError } = await supabase
      .from("daily_sessions")
      .update({ is_active: true })
      .eq("id", sessionId);

    if (activateError) {
      return { ok: false, error: activateError.message };
    }

    revalidatePath("/admin");
    return { ok: true, data: { sessionId } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error activating session",
    };
  }
}

/**
 * Wipe player assignments and reset team occupancy counters for a session.
 */
export async function resetSessionAssignments(
  sessionId: string
): Promise<ActionResult<{ cleared: number }>> {
  try {
    if (!sessionId) {
      return { ok: false, error: "sessionId is required" };
    }

    const supabase = createAdminSupabaseClient();

    const { data: deleted, error: deleteError } = await supabase
      .from("player_assignments")
      .delete()
      .eq("session_id", sessionId)
      .select("id");

    if (deleteError) {
      return { ok: false, error: deleteError.message };
    }

    const { error: resetError } = await supabase
      .from("teams")
      .update({ current_count: 0 })
      .eq("session_id", sessionId);

    if (resetError) {
      return { ok: false, error: resetError.message };
    }

    revalidatePath("/admin");
    return { ok: true, data: { cleared: deleted?.length ?? 0 } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error resetting assignments",
    };
  }
}

/** Load active session + teams + joined count for the admin dashboard. */
export async function getActiveSessionSnapshot(): Promise<ActiveSessionSnapshot | null> {
  const supabase = createAdminSupabaseClient();

  const { data: session, error: sessionError } = await supabase
    .from("daily_sessions")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }
  if (!session) {
    return null;
  }

  const { data: teamRows, error: teamsError } = await supabase
    .from("teams")
    .select("*")
    .eq("session_id", session.id)
    .order("team_number", { ascending: true });

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const teams = (teamRows ?? []).map(mapTeam);
  const totalJoined = teams.reduce((sum, t) => sum + t.current_count, 0);

  return { session, teams, totalJoined };
}

/** Chronological session list for history table. */
export async function listSessions(): Promise<DailySession[]> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("daily_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
