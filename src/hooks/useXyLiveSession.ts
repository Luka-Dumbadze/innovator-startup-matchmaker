"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  EMPTY_XY_SNAPSHOT,
  XY_TABLES,
  applyXySessionStatusPoll,
  fetchXySessionStatusPoll,
  fetchXySnapshot,
} from "@/lib/supabase/xy-client";
import {
  applyXyIndividualVoteEvent,
  type XyIndividualVoteChange,
} from "@/lib/xy/individual-votes";
import { applyXyPlayerEvent, type XyPlayerChange } from "@/lib/xy/roster";
import type { XYSession, XYSnapshot } from "@/types/xy";

/**
 * 1s fallback when Realtime drops a message. Polls ONLY lightweight session
 * status columns — never the roster / vote joins — so a 1-hour session stays
 * cheap on the wire.
 */
export const XY_POLL_INTERVAL_MS = 1000;

export type XyLiveState = XYSnapshot & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const MERGED_TABLES = new Set(["xy_players", "xy_individual_votes"]);

/**
 * Keeps an XY screen in sync with the active session.
 *
 * Realtime gives instant updates; a 1s lightweight status poll guarantees
 * phones still flip to the voting view even when the websocket drops a message.
 */
export function useXyLiveSession(initial?: XYSnapshot): XyLiveState {
  const [snapshot, setSnapshot] = useState<XYSnapshot>(initial ?? EMPTY_XY_SNAPSHOT);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const sessionRef = useRef<XYSession | null>(initial?.session ?? null);
  // Rows the session-scoped channels injected while a snapshot fetch was in
  // flight — kept across the next setSnapshot so a stale response cannot
  // flash a just-joined student or a just-cast vote back out of the panel.
  const pendingPlayerIdsRef = useRef(new Set<string>());
  const pendingVoteIdsRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const next = await fetchXySnapshot(createBrowserSupabaseClient());
      setSnapshot((prev) => {
        if (!next.session || prev.session?.id !== next.session.id) {
          pendingPlayerIdsRef.current.clear();
          pendingVoteIdsRef.current.clear();
          sessionRef.current = next.session;
          return next;
        }

        const serverPlayerIds = new Set(next.players.map((p) => p.id));
        for (const id of [...pendingPlayerIdsRef.current]) {
          if (serverPlayerIds.has(id)) pendingPlayerIdsRef.current.delete(id);
        }

        const pendingPlayers = prev.players.filter(
          (p) =>
            pendingPlayerIdsRef.current.has(p.id) && !serverPlayerIds.has(p.id)
        );

        const serverVoteIds = new Set(next.individualVotes.map((v) => v.id));
        for (const id of [...pendingVoteIdsRef.current]) {
          if (serverVoteIds.has(id)) pendingVoteIdsRef.current.delete(id);
        }

        const pendingVotes = prev.individualVotes.filter(
          (v) =>
            pendingVoteIdsRef.current.has(v.id) && !serverVoteIds.has(v.id)
        );

        if (pendingPlayers.length === 0 && pendingVotes.length === 0) {
          sessionRef.current = next.session;
          return next;
        }

        const players =
          pendingPlayers.length === 0
            ? next.players
            : [...next.players, ...pendingPlayers].sort((a, b) =>
                a.created_at.localeCompare(b.created_at)
              );

        const individualVotes =
          pendingVotes.length === 0
            ? next.individualVotes
            : [...next.individualVotes, ...pendingVotes].sort(
                (a, b) =>
                  a.player_id.localeCompare(b.player_id) ||
                  a.round_number - b.round_number
              );

        sessionRef.current = next.session;
        return { ...next, players, individualVotes };
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

  /** Status-only probe — used by the interval so hour-long play stays cheap. */
  const pollSessionStatus = useCallback(async () => {
    if (inFlightRef.current) return;

    try {
      const poll = await fetchXySessionStatusPoll(
        createBrowserSupabaseClient(),
        sessionRef.current?.id ?? null
      );
      const decision = applyXySessionStatusPoll(sessionRef.current, poll);

      if (decision === "unchanged") return;

      if (decision === "refresh") {
        await refresh();
        return;
      }

      sessionRef.current = decision;
      setSnapshot((prev) =>
        prev.session?.id === decision.id
          ? { ...prev, session: decision }
          : prev
      );
      setError(null);
    } catch (err) {
      console.error("[xy] session status poll failed", err);
      setError(err instanceof Error ? err.message : "მონაცემები ვერ ჩაიტვირთა");
    }
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();

    const interval = window.setInterval(() => {
      void pollSessionStatus();
    }, XY_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [pollSessionStatus, refresh]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let channel = supabase.channel("xy-live");

    // Roster + phone votes have session-scoped channels below that merge the
    // row locally instead of only asking for a refetch.
    for (const table of XY_TABLES.filter((t) => !MERGED_TABLES.has(t))) {
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

  const applyVoteChange = useCallback((change: XyIndividualVoteChange) => {
    if (change.eventType === "DELETE") {
      const removedId =
        typeof change.old?.id === "string" ? change.old.id : null;
      if (removedId) pendingVoteIdsRef.current.delete(removedId);
    } else if (typeof change.new?.id === "string") {
      pendingVoteIdsRef.current.add(change.new.id);
    }

    setSnapshot((prev) => {
      const sessionId = prev.session?.id;
      if (!sessionId) return prev;

      const individualVotes = applyXyIndividualVoteEvent(
        prev.individualVotes,
        change,
        sessionId
      );
      return individualVotes === prev.individualVotes
        ? prev
        : { ...prev, individualVotes };
    });
  }, []);

  /**
   * Roster + submission events are merged into state the moment they arrive,
   * so a student joining or voting on their phone shows up on the mentor panel
   * instantly rather than on the next poll.
   */
  const sessionId = snapshot.session?.id ?? null;

  useEffect(() => {
    if (!sessionId) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`xy-live-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xy_players",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          applyPlayerChange({
            eventType: payload.eventType,
            new: payload.new as Record<string, unknown> | null,
            old: payload.old as Record<string, unknown> | null,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xy_individual_votes",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          applyVoteChange({
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
  }, [applyPlayerChange, applyVoteChange, sessionId]);

  return { ...snapshot, loading, error, refresh };
}
