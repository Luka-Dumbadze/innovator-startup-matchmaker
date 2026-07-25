"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MODE_SECONDS,
  SOLO_TO_TEAM_NOTICE,
  parseTimerMode,
  playPhaseTransitionChime,
  sessionTimerChannelName,
  startExpiryAlarm,
  stopExpiryAlarm,
  triggerExpiryVibration,
  triggerPhaseTransitionVibration,
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
  /** Soft Solo → Team handoff message (cleared after a few seconds). */
  phaseTransitionNotice: string | null;
  dismissExpiredAlert: () => void;
  clearPhaseTransitionNotice: () => void;
};

/**
 * Subscribes to host timer broadcasts on `session-timer-${sessionId}`
 * and mirrors countdown locally for the student phone UI.
 */
export function useSessionTimerSync(sessionId: string | null): SyncedTimerState {
  const [mode, setMode] = useState<TimerMode>("solo_brainstorm");
  const [secondsRemaining, setSecondsRemaining] = useState(MODE_SECONDS.solo_brainstorm);
  const [running, setRunning] = useState(false);
  const [expiredAlert, setExpiredAlert] = useState(false);
  const [phaseTransitionNotice, setPhaseTransitionNotice] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const vibrateRepeatRef = useRef<number | null>(null);
  const expiredLockRef = useRef(false);
  const modeRef = useRef<TimerMode>("solo_brainstorm");
  const noticeTimerRef = useRef<number | null>(null);

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

  const clearPhaseTransitionNotice = useCallback(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setPhaseTransitionNotice(null);
  }, []);

  const showSoloToTeamTransition = useCallback(() => {
    playPhaseTransitionChime();
    triggerPhaseTransitionVibration();
    setPhaseTransitionNotice(SOLO_TO_TEAM_NOTICE);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setPhaseTransitionNotice(null);
      noticeTimerRef.current = null;
    }, 8000);
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

  const triggerExpired = useCallback(() => {
    if (expiredLockRef.current) return;
    expiredLockRef.current = true;
    setRunning(false);
    setSecondsRemaining(0);
    setExpiredAlert(true);
    startExpiryAlarm();
    triggerExpiryVibration();
    clearVibrateLoop();
    vibrateRepeatRef.current = window.setInterval(() => {
      triggerExpiryVibration();
    }, 1600);
  }, [clearVibrateLoop]);

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
        const prevMode = modeRef.current;

        if (prevMode === "solo_brainstorm" && nextMode === "team_brainstorm") {
          showSoloToTeamTransition();
        }

        expiredLockRef.current = false;
        setMode(nextMode);
        setSecondsRemaining(Math.max(0, data.secondsRemaining));
        setRunning(data.secondsRemaining > 0);
        setExpiredAlert(false);
        stopExpiryAlarm();
        clearVibrateLoop();
      })
      .on("broadcast", { event: "TIMER_PAUSED" }, ({ payload }) => {
        const data = payload as TimerPausedPayload;
        if (!data || typeof data.secondsRemaining !== "number") return;
        if (data.mode) setMode(parseTimerMode(data.mode));
        setSecondsRemaining(Math.max(0, data.secondsRemaining));
        setRunning(false);
      })
      .on("broadcast", { event: "TIMER_RESET" }, ({ payload }) => {
        const data = payload as TimerResetPayload;
        if (!data || typeof data.secondsRemaining !== "number") return;
        expiredLockRef.current = false;
        setMode(parseTimerMode(data.mode));
        setSecondsRemaining(Math.max(0, data.secondsRemaining));
        setRunning(false);
        setExpiredAlert(false);
        stopExpiryAlarm();
        clearVibrateLoop();
        clearPhaseTransitionNotice();
      })
      .on("broadcast", { event: "TIMER_EXPIRED" }, ({ payload }) => {
        const data = payload as Partial<TimerExpiredPayload> | undefined;
        const expiredMode = parseTimerMode(data?.mode ?? modeRef.current);

        // Solo end during Full Flow → soft handoff (team start follows), not full alarm.
        if (expiredMode === "solo_brainstorm") {
          setRunning(false);
          setSecondsRemaining(0);
          showSoloToTeamTransition();
          return;
        }

        setMode(expiredMode);
        triggerExpired();
      })
      .subscribe();

    return () => {
      clearLocalTick();
      clearVibrateLoop();
      clearPhaseTransitionNotice();
      stopExpiryAlarm();
      void supabase.removeChannel(channel);
    };
  }, [
    sessionId,
    clearLocalTick,
    clearVibrateLoop,
    clearPhaseTransitionNotice,
    triggerExpired,
    showSoloToTeamTransition,
  ]);

  useEffect(() => {
    if (!running) {
      clearLocalTick();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearLocalTick();
          setRunning(false);
          const currentMode = modeRef.current;
          queueMicrotask(() => {
            if (currentMode === "solo_brainstorm") {
              showSoloToTeamTransition();
              return;
            }
            triggerExpired();
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearLocalTick;
  }, [running, clearLocalTick, triggerExpired, showSoloToTeamTransition]);

  useEffect(() => {
    return () => {
      stopExpiryAlarm();
      clearVibrateLoop();
      clearPhaseTransitionNotice();
    };
  }, [clearVibrateLoop, clearPhaseTransitionNotice]);

  return {
    mode,
    secondsRemaining,
    running,
    expiredAlert,
    phaseTransitionNotice,
    dismissExpiredAlert,
    clearPhaseTransitionNotice,
  };
}
