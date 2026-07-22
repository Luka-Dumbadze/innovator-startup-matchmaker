"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { toTeam } from "@/lib/supabase/types";
import type { DailySession, Team } from "@/types/game";

export type HostSessionState = {
  session: DailySession | null;
  teams: Team[];
  totalJoined: number;
  totalCapacity: number;
  loading: boolean;
  error: string | null;
  /** Team IDs that just received a join — drives pulse animations. */
  recentlyJoinedTeamIds: ReadonlySet<string>;
  refresh: () => Promise<void>;
};

type TeamRow = {
  id: string;
  session_id: string;
  team_number: number;
  name: string;
  color: string;
  words: string[];
  max_capacity: number;
  current_count: number;
};

function sortTeams(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => a.team_number - b.team_number);
}

function mapTeamRow(row: TeamRow): Team {
  return toTeam(row);
}

/**
 * Loads the active daily session + teams, then keeps occupancy in sync via
 * Supabase Realtime (`teams` updates and `player_assignments` inserts).
 */
export function useRealtimeHostSession(): HostSessionState {
  const [session, setSession] = useState<DailySession | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentlyJoinedTeamIds, setRecentlyJoinedTeamIds] = useState<Set<string>>(
    () => new Set()
  );

  const pulseTimers = useRef<Map<string, number>>(new Map());
  const sessionIdRef = useRef<string | null>(null);

  const markJoined = useCallback((teamId: string) => {
    setRecentlyJoinedTeamIds((prev) => {
      const next = new Set(prev);
      next.add(teamId);
      return next;
    });

    const existing = pulseTimers.current.get(teamId);
    if (existing) window.clearTimeout(existing);

    const timeout = window.setTimeout(() => {
      setRecentlyJoinedTeamIds((prev) => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
      pulseTimers.current.delete(teamId);
    }, 1600);

    pulseTimers.current.set(teamId, timeout);
  }, []);

  const fetchActive = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();

    const { data: activeSession, error: sessionError } = await supabase
      .from("daily_sessions")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    if (!activeSession) {
      sessionIdRef.current = null;
      setSession(null);
      setTeams([]);
      return;
    }

    sessionIdRef.current = activeSession.id;
    setSession(activeSession);

    const { data: teamRows, error: teamsError } = await supabase
      .from("teams")
      .select("*")
      .eq("session_id", activeSession.id)
      .order("team_number", { ascending: true });

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    setTeams(sortTeams((teamRows ?? []).map((row) => mapTeamRow(row as TeamRow))));
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await fetchActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load host session");
    }
  }, [fetchActive]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await fetchActive();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load host session");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchActive]);

  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) return;

    const supabase = createBrowserSupabaseClient();
    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel(`host-session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teams",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<TeamRow>;
            if (!oldRow.id) return;
            setTeams((prev) => prev.filter((t) => t.id !== oldRow.id));
            return;
          }

          const row = payload.new as TeamRow;
          if (!row?.id) return;

          setTeams((prev) => {
            const existing = prev.find((t) => t.id === row.id);
            const nextTeam = mapTeamRow(row);

            if (
              existing &&
              row.current_count > existing.current_count
            ) {
              markJoined(row.id);
            }

            const without = prev.filter((t) => t.id !== row.id);
            return sortTeams([...without, nextTeam]);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "player_assignments",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const assignment = payload.new as { team_id?: string };
          if (assignment.team_id) {
            markJoined(assignment.team_id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "daily_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const next = payload.new as DailySession;
          setSession(next);
          if (!next.is_active) {
            // Active session flipped off — reload to pick up a new one (if any).
            void refresh();
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [session?.id, markJoined, refresh]);

  useEffect(() => {
    const timers = pulseTimers.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  const { totalJoined, totalCapacity } = useMemo(() => {
    const joined = teams.reduce((sum, t) => sum + t.current_count, 0);
    const capacity = teams.reduce((sum, t) => sum + t.max_capacity, 0);
    return { totalJoined: joined, totalCapacity: capacity };
  }, [teams]);

  return {
    session,
    teams,
    totalJoined,
    totalCapacity,
    loading,
    error,
    recentlyJoinedTeamIds,
    refresh,
  };
}
