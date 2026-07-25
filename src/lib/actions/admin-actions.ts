"use server";

import { revalidatePath } from "next/cache";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type {
  DailySession,
  PlayerAssignment,
  SubmittedIdea,
  Team,
} from "@/types/game";

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

/** One team with nested roster + submissions for archive views. */
export type SessionArchiveTeam = Team & {
  assignments: PlayerAssignment[];
  ideas: SubmittedIdea[];
};

/** Full relational snapshot for a daily session (admin archive). */
export type FullSessionArchive = {
  session: DailySession;
  teams: SessionArchiveTeam[];
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
      throw new Error(`Team ${team.teamNumber} needs a global challenge`);
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

function mapAssignment(row: {
  id: string;
  session_id: string;
  team_id: string;
  player_uid: string;
  real_name?: string | null;
  nickname?: string | null;
  joined_at: string;
}): PlayerAssignment {
  return {
    id: row.id,
    session_id: row.session_id,
    team_id: row.team_id,
    player_uid: row.player_uid,
    real_name: (row.real_name ?? "").trim(),
    nickname: (row.nickname ?? "").trim(),
    joined_at: row.joined_at,
  };
}

function mapSubmittedIdea(row: {
  id: string;
  session_id: string;
  team_id: string;
  author_player_uid: string;
  author_real_name?: string | null;
  author_nickname: string;
  startup_name: string;
  one_sentence_solution: string;
  tools_integration: string;
  is_final_team_pitch: boolean;
  created_at: string;
}): SubmittedIdea {
  return {
    id: row.id,
    session_id: row.session_id,
    team_id: row.team_id,
    author_player_uid: row.author_player_uid,
    author_real_name: (row.author_real_name ?? "").trim(),
    author_nickname: row.author_nickname,
    startup_name: row.startup_name,
    one_sentence_solution: row.one_sentence_solution,
    tools_integration: row.tools_integration,
    is_final_team_pitch: row.is_final_team_pitch,
    created_at: row.created_at,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Fetch complete relational archive for a session:
 * session → teams → player_assignments + submitted_ideas.
 */
export async function getFullSessionArchive(
  sessionId: string
): Promise<ActionResult<FullSessionArchive>> {
  try {
    if (!sessionId) {
      return { ok: false, error: "sessionId is required" };
    }

    const supabase = createAdminSupabaseClient();

    const { data: session, error: sessionError } = await supabase
      .from("daily_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return { ok: false, error: sessionError.message };
    }
    if (!session) {
      return { ok: false, error: "Session not found" };
    }

    const [teamsRes, assignmentsRes, ideasRes] = await Promise.all([
      supabase
        .from("teams")
        .select("*")
        .eq("session_id", sessionId)
        .order("team_number", { ascending: true }),
      supabase
        .from("player_assignments")
        .select("*")
        .eq("session_id", sessionId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("submitted_ideas")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

    if (teamsRes.error) {
      return { ok: false, error: teamsRes.error.message };
    }
    if (assignmentsRes.error) {
      return { ok: false, error: assignmentsRes.error.message };
    }
    if (ideasRes.error) {
      return { ok: false, error: ideasRes.error.message };
    }

    const assignments = (assignmentsRes.data ?? []).map(mapAssignment);
    const ideas = (ideasRes.data ?? []).map(mapSubmittedIdea);

    const teams: SessionArchiveTeam[] = (teamsRes.data ?? []).map((row) => {
      const team = mapTeam(row);
      return {
        ...team,
        assignments: assignments.filter((a) => a.team_id === team.id),
        ideas: ideas.filter((i) => i.team_id === team.id),
      };
    });

    return { ok: true, data: { session, teams } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error loading archive",
    };
  }
}

/**
 * Build a CSV export of session submissions (one row per submitted idea).
 */
export async function exportSessionCSV(
  sessionId: string
): Promise<ActionResult<string>> {
  const archive = await getFullSessionArchive(sessionId);
  if (!archive.ok) {
    return archive;
  }

  const header = [
    "Team Number",
    "Team Name",
    "Global Challenge",
    "Tools",
    "Player Real Name",
    "Nickname",
    "Startup Title",
    "Solution",
    "Tools Integration",
    "Is Final Pitch",
    "Submission Timestamp",
  ];

  const rows: string[][] = [];

  for (const team of archive.data.teams) {
    const tools = team.words.join(" · ");
    for (const idea of team.ideas) {
      rows.push([
        String(team.team_number),
        team.name,
        team.domain,
        tools,
        idea.author_real_name || "—",
        idea.author_nickname || "—",
        idea.startup_name,
        idea.one_sentence_solution,
        idea.tools_integration,
        idea.is_final_team_pitch ? "yes" : "no",
        idea.created_at,
      ]);
    }
  }

  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((cols) => cols.map(csvEscape).join(",")),
  ];

  return { ok: true, data: lines.join("\n") };
}
