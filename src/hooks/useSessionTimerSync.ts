"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MODE_SECONDS,
  parseTimerMode,
  sessionTimerChannelName,
  startExpiryAlarm,
  stopExpiryAlarm,
  triggerExpiryVibration,
  type TimerExpiredPayload,
  type TimerMode,
  type TimerPausedPayload,
  type TimerResetPayload,
  type TimerStartedPayload,
} from "@/lib/timer/session-timer";

export type SyncedTimerState = {
  mode: TimerMode;
  secondsRemaining: number;
  running: boolean;
  expiredAlert: boolean;
  dismissExpiredAlert: () => void;
};

function secondsUntil(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

/**
 * Subscribes to host timer broadcasts on `session-timer-${sessionId}`
 * and mirrors a live mm:ss countdown locally for the student phone UI.
 *
 * Prefers host `endsAt` timestamps; falls back to local decrement when absent.
 */
export function useSessionTimerSync(sessionId: string | null): SyncedTimerState {
  const [mode, setMode] = useState<TimerMode>("solo_brainstorm");
  const [secondsRemaining, setSecondsRemaining] = useState(MODE_SECONDS.solo_brainstorm);
  const [running, setRunning] = useState(false);
  const [expiredAlert, setExpiredAlert] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const vibrateRepeatRef = useRef<number | null>(null);
  const expiredLockRef = useRef(false);
  const modeRef = useRef<TimerMode>("solo_brainstorm");
  const endsAtRef = useRef<number | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const clearLocalTick = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearVibrateLoop = useCallback(() => {
    if (vibrateRepeatRef.current !== null) {
      window.clearInterval(vibrateRepeatRef.current);
      vibrateRepeatRef.current = null;
    }
  }, []);

  const dismissExpiredAlert = useCallback(() => {
    stopExpiryAlarm();
    clearVibrateLoop();
    expiredLockRef.current = false;
    try {
      navigator.vibrate?.(0);
    } catch {
      // ignore
    }
    setExpiredAlert(false);
  }, [clearVibrateLoop]);

  const triggerExpired = useCallback(
    (expiredMode?: TimerMode) => {
      if (expiredLockRef.current) return;
      expiredLockRef.current = true;
      endsAtRef.current = null;
      if (expiredMode) {
        setMode(expiredMode);
        modeRef.current = expiredMode;
      }
      setRunning(false);
      setSecondsRemaining(0);
      setExpiredAlert(true);
      startExpiryAlarm();
      triggerExpiryVibration();
      clearVibrateLoop();
      vibrateRepeatRef.current = window.setInterval(() => {
        triggerExpiryVibration();
      }, 1600);
    },
    [clearVibrateLoop]
  );

  useEffect(() => {
    if (!sessionId) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(sessionTimerChannelName(sessionId), {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "TIMER_STARTED" }, ({ payload }) => {
        const data = payload as TimerStartedPayload;
        if (!data || typeof data.secondsRemaining !== "number") return;
        const nextMode = parseTimerMode(data.mode);
        const secs = Math.max(0, data.secondsRemaining);
        const endsAt =
          typeof data.endsAt === "number" && data.endsAt > Date.now()
            ? data.endsAt
            : Date.now() + secs * 1000;

        expiredLockRef.current = false;
        endsAtRef.current = secs > 0 ? endsAt : null;
        setMode(nextMode);
        modeRef.current = nextMode;
        setSecondsRemaining(secs > 0 ? secondsUntil(endsAt) : 0);
        setRunning(secs > 0);
        setExpiredAlert(false);
        stopExpiryAlarm();
        clearVibrateLoop();
      })
      .on("broadcast", { event: "TIMER_PAUSED" }, ({ payload }) => {
        const data = payload as TimerPausedPayload;
        if (!data || typeof data.secondsRemaining !== "number") return;
        endsAtRef.current = null;
        if (data.mode) {
          const nextMode = parseTimerMode(data.mode);
          setMode(nextMode);
          modeRef.current = nextMode;
        }
        setSecondsRemaining(Math.max(0, data.secondsRemaining));
        setRunning(false);
      })
      .on("broadcast", { event: "TIMER_RESET" }, ({ payload }) => {
        const data = payload as TimerResetPayload;
        if (!data || typeof data.secondsRemaining !== "number") return;
        expiredLockRef.current = false;
        endsAtRef.current = null;
        const nextMode = parseTimerMode(data.mode);
        setMode(nextMode);
        modeRef.current = nextMode;
        setSecondsRemaining(Math.max(0, data.secondsRemaining));
        setRunning(false);
        setExpiredAlert(false);
        stopExpiryAlarm();
        clearVibrateLoop();
      })
      .on("broadcast", { event: "TIMER_EXPIRED" }, ({ payload }) => {
        const data = payload as Partial<TimerExpiredPayload> | undefined;
        const expiredMode = parseTimerMode(data?.mode ?? modeRef.current);
        triggerExpired(expiredMode);
      })
      .subscribe();

    return () => {
      clearLocalTick();
      clearVibrateLoop();
      stopExpiryAlarm();
      void supabase.removeChannel(channel);
    };
  }, [sessionId, clearLocalTick, clearVibrateLoop, triggerExpired]);

  useEffect(() => {
    if (!running) {
      clearLocalTick();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const endsAt = endsAtRef.current;
      if (endsAt != null) {
        const left = secondsUntil(endsAt);
        setSecondsRemaining(left);
        if (left <= 0) {
          clearLocalTick();
          setRunning(false);
          queueMicrotask(() => triggerExpired(modeRef.current));
        }
        return;
      }

      // Fallback when host did not send endsAt
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearLocalTick();
          setRunning(false);
          queueMicrotask(() => triggerExpired(modeRef.current));
          return 0;
        }
        return prev - 1;
      });
    }, 250);

    return clearLocalTick;
  }, [running, clearLocalTick, triggerExpired]);

  useEffect(() => {
    return () => {
      stopExpiryAlarm();
      clearVibrateLoop();
    };
  }, [clearVibrateLoop]);

  return {
    mode,
    secondsRemaining,
    running,
    expiredAlert,
    dismissExpiredAlert,
  };
}
