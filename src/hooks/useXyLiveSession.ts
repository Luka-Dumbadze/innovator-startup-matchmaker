"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { EMPTY_XY_SNAPSHOT, XY_TABLES, fetchXySnapshot } from "@/lib/supabase/xy-client";
import { applyXyPlayerEvent, type XyPlayerChange } from "@/lib/xy/roster";
import type { XYSnapshot } from "@/types/xy";

/** Polling cadence — the safety net when a Realtime event is missed. */
export const XY_POLL_INTERVAL_MS = 1500;

export type XyLiveState = XYSnapshot & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Keeps an XY screen in sync with the active session.
 *
 * Realtime gives instant updates; a 1.5s poll guarantees phones still flip to
 * the voting view even when the websocket drops a message.
 */
export function useXyLiveSession(initial?: XYSnapshot): XyLiveState {
  const [snapshot, setSnapshot] = useState<XYSnapshot>(initial ?? EMPTY_XY_SNAPSHOT);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  // Player ids the roster channel injected while a snapshot fetch was in
  // flight — kept across the next setSnapshot so a stale response cannot
  // flash a just-joined student back out of the mentor panel.
  const pendingPlayerIdsRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const next = await fetchXySnapshot(createBrowserSupabaseClient());
      setSnapshot((prev) => {
        if (!next.session || prev.session?.id !== next.session.id) {
          pendingPlayerIdsRef.current.clear();
          return next;
        }

        const serverIds = new Set(next.players.map((p) => p.id));
        for (const id of [...pendingPlayerIdsRef.current]) {
          if (serverIds.has(id)) pendingPlayerIdsRef.current.delete(id);
        }

        const pending = prev.players.filter(
          (p) =>
            pendingPlayerIdsRef.current.has(p.id) && !serverIds.has(p.id)
        );

        if (pending.length === 0) return next;

        const players = [...next.players, ...pending].sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
        return { ...next, players };
      });
      setError(null);
    } catch (err) {
      console.error("[xy] snapshot refresh failed", err);
      setError(err instanceof Error ? err.message : "მონაცემები ვერ ჩაიტვირთა");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();

    const interval = window.setInterval(() => {
      void refresh();
    }, XY_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let channel = supabase.channel("xy-live");

    // xy_players has its own session-scoped channel below, which merges the
    // row locally instead of only asking for a refetch.
    for (const table of XY_TABLES.filter((t) => t !== "xy_players")) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void refresh();
        }
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const applyPlayerChange = useCallback((change: XyPlayerChange) => {
    if (change.eventType === "DELETE") {
      const removedId =
        typeof change.old?.id === "string" ? change.old.id : null;
      if (removedId) pendingPlayerIdsRef.current.delete(removedId);
    } else if (typeof change.new?.id === "string") {
      pendingPlayerIdsRef.current.add(change.new.id);
    }

    setSnapshot((prev) => {
      const sessionId = prev.session?.id;
      if (!sessionId) return prev;

      const players = applyXyPlayerEvent(prev.players, change, sessionId);
      return players === prev.players ? prev : { ...prev, players };
    });
  }, []);

  /**
   * Roster events are merged into state the moment they arrive, so a student
   * joining on their phone shows up on the mentor's panel instantly rather than
   * on the next poll. The refetch that follows reconciles everything else.
   */
  const sessionId = snapshot.session?.id ?? null;

  useEffect(() => {
    if (!sessionId) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`xy-roster-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xy_players",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          // Merge first so the roster paints before the next 1.5s poll lands.
          // A refetch here would race the merge and can briefly erase the new row.
          applyPlayerChange({
            eventType: payload.eventType,
            new: payload.new as Record<string, unknown> | null,
            old: payload.old as Record<string, unknown> | null,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyPlayerChange, sessionId]);

  return { ...snapshot, loading, error, refresh };
}
