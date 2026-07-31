"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { EMPTY_XY_SNAPSHOT, XY_TABLES, fetchXySnapshot } from "@/lib/supabase/xy-client";
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

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const next = await fetchXySnapshot(createBrowserSupabaseClient());
      setSnapshot(next);
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

    for (const table of XY_TABLES) {
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

  return { ...snapshot, loading, error, refresh };
}
