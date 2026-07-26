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
  type PitchExpiredPayload,
  type PitchSelectedPayload,
  type PitchStartedPayload,
  type TimerExpiredPayload,
  type TimerMode,
  type TimerPausedPayload,
  type TimerResetPayload,
  type TimerStartedPayload,
} from "@/lib/timer/session-timer";

export type PitchSelectionState = {
  teamId: string;
  teamName: string;
  teamColor: string | null;
  selectedPitcherUid: string;
  selectedPitcherNickname: string;
  startupName: string;
  solution: string;
  tools: string;
  toolWords: string[];
  nextUpTeamName: string | null;
  nextUpTeamColor: string | null;
  progressText: string;
  pitchedCount: number;
  totalTeams: number;
};

export type SyncedTimerState = {
  mode: TimerMode;
  secondsRemaining: number;
  running: boolean;
  expiredAlert: boolean;
  /** Team currently pitching (host selection); null outside pitch mode. */
  activePitchTeamId: string | null;
  /** Latest host random team + pitcher selection broadcast. */
  pitchSelection: PitchSelectionState | null;
  dismissExpiredAlert: () => void;
  dismissPitchSelection: () => void;
};

function secondsUntil(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function parsePitchSelection(data: PitchSelectedPayload): PitchSelectionState | null {
  if (!data?.teamId || !data.selectedPitcherUid) return null;
  return {
    teamId: data.teamId,
    teamName: data.teamName ?? "",
    teamColor: data.teamColor ?? null,
    selectedPitcherUid: data.selectedPitcherUid,
    selectedPitcherNickname: data.selectedPitcherNickname ?? "Pitcher",
    startupName: data.startupName ?? "Untitled Startup",
    solution: data.solution ?? "—",
    tools: data.tools ?? "—",
    toolWords: Array.isArray(data.toolWords) ? data.toolWords : [],
    nextUpTeamName: data.nextUpTeamName ?? null,
    nextUpTeamColor: data.nextUpTeamColor ?? null,
    progressText: data.progressText ?? "",
    pitchedCount: typeof data.pitchedCount === "number" ? data.pitchedCount : 0,
    totalTeams: typeof data.totalTeams === "number" ? data.totalTeams : 0,
  };
}

/**
 * Subscribes to host timer broadcasts on `session-timer-${sessionId}`
 * and mirrors a live mm:ss countdown locally for the student phone UI.
 *
 * Pitch expiry alarms only fire when `myTeamId` matches the host's target team.
 */
export function useSessionTimerSync(
  sessionId: string | null,
  myTeamId: string | null = null
): SyncedTimerState {
  const [mode, setMode] = useState<TimerMode>("solo_brainstorm");
  const [secondsRemaining, setSecondsRemaining] = useState(MODE_SECONDS.solo_brainstorm);
  const [running, setRunning] = useState(false);
  const [expiredAlert, setExpiredAlert] = useState(false);
  const [activePitchTeamId, setActivePitchTeamId] = useState<string | null>(null);
  const [pitchSelection, setPitchSelection] = useState<PitchSelectionState | null>(null);

  const intervalRef = useRef<number | null>(null);
  const vibrateRepeatRef = useRef<number | null>(null);
  const expiredLockRef = useRef(false);
  const modeRef = useRef<TimerMode>("solo_brainstorm");
  const endsAtRef = useRef<number | null>(null);
  const activePitchTeamIdRef = useRef<string | null>(null);
  const myTeamIdRef = useRef<string | null>(myTeamId);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    activePitchTeamIdRef.current = activePitchTeamId;
  }, [activePitchTeamId]);

  useEffect(() => {
    myTeamIdRef.current = myTeamId;
  }, [myTeamId]);

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

  const dismissPitchSelection = useCallback(() => {
    setPitchSelection(null);
  }, []);

  const shouldAlarmForPitch = useCallback((targetTeamId: string | null | undefined) => {
    const mine = myTeamIdRef.current;
    if (!mine) return false;
    if (!targetTeamId) return false;
    return targetTeamId === mine;
  }, []);

  const triggerExpired = useCallback(
    (expiredMode?: TimerMode, targetTeamId?: string | null) => {
      if (expiredLockRef.current) return;

      const modeToUse = expiredMode ?? modeRef.current;
      endsAtRef.current = null;
      setRunning(false);
      setSecondsRemaining(0);
      if (expiredMode) {
        setMode(expiredMode);
        modeRef.current = expiredMode;
      }

      // Pitch alarms are team-targeted — everyone else stays silent.
      if (modeToUse === "pitch") {
        const target = targetTeamId ?? activePitchTeamIdRef.current;
        if (!shouldAlarmForPitch(target)) {
          expiredLockRef.current = true;
          setExpiredAlert(false);
          return;
        }
      }

      expiredLockRef.current = true;
      setExpiredAlert(true);
      startExpiryAlarm();
      triggerExpiryVibration();
      clearVibrateLoop();
      vibrateRepeatRef.current = window.setInterval(() => {
        triggerExpiryVibration();
      }, 1600);
    },
    [clearVibrateLoop, shouldAlarmForPitch]
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

        if (nextMode === "pitch" && data.activeTeamId) {
          setActivePitchTeamId(data.activeTeamId);
          activePitchTeamIdRef.current = data.activeTeamId;
        } else if (nextMode !== "pitch") {
          setActivePitchTeamId(null);
          activePitchTeamIdRef.current = null;
        }
      })
      .on("broadcast", { event: "PITCH_SELECTED" }, ({ payload }) => {
        const data = payload as PitchSelectedPayload;
        const parsed = parsePitchSelection(data);
        if (!parsed) return;
        setPitchSelection(parsed);
        setActivePitchTeamId(parsed.teamId);
        activePitchTeamIdRef.current = parsed.teamId;
        try {
          if (myTeamIdRef.current === parsed.teamId) {
            navigator.vibrate?.([120, 60, 120, 60, 200]);
          }
        } catch {
          // ignore
        }
      })
      .on("broadcast", { event: "PITCH_STARTED" }, ({ payload }) => {
        const data = payload as PitchStartedPayload;
        if (!data?.activeTeamId) return;
        setActivePitchTeamId(data.activeTeamId);
        activePitchTeamIdRef.current = data.activeTeamId;
        setMode("pitch");
        modeRef.current = "pitch";
        if (typeof data.secondsRemaining === "number") {
          const secs = Math.max(0, data.secondsRemaining);
          const endsAt =
            typeof data.endsAt === "number" && data.endsAt > Date.now()
              ? data.endsAt
              : Date.now() + secs * 1000;
          endsAtRef.current = secs > 0 ? endsAt : null;
          setSecondsRemaining(secs > 0 ? secondsUntil(endsAt) : 0);
          setRunning(secs > 0);
        }
        // Merge pitcher identity into existing selection when host starts the clock.
        if (data.selectedPitcherUid) {
          setPitchSelection((prev) => {
            if (prev && prev.teamId === data.activeTeamId) {
              return {
                ...prev,
                selectedPitcherUid: data.selectedPitcherUid!,
                selectedPitcherNickname:
                  data.selectedPitcherNickname ?? prev.selectedPitcherNickname,
              };
            }
            return prev;
          });
        }
        expiredLockRef.current = false;
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
        if (nextMode !== "pitch") {
          setActivePitchTeamId(null);
          activePitchTeamIdRef.current = null;
        }
      })
      .on("broadcast", { event: "TIMER_EXPIRED" }, ({ payload }) => {
        const data = payload as Partial<TimerExpiredPayload> | undefined;
        const expiredMode = parseTimerMode(data?.mode ?? modeRef.current);
        triggerExpired(expiredMode, data?.targetTeamId ?? activePitchTeamIdRef.current);
      })
      .on("broadcast", { event: "PITCH_EXPIRED" }, ({ payload }) => {
        const data = payload as PitchExpiredPayload;
        if (!data?.targetTeamId) return;
        triggerExpired("pitch", data.targetTeamId);
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
          queueMicrotask(() =>
            triggerExpired(modeRef.current, activePitchTeamIdRef.current)
          );
        }
        return;
      }

      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearLocalTick();
          setRunning(false);
          queueMicrotask(() =>
            triggerExpired(modeRef.current, activePitchTeamIdRef.current)
          );
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
    activePitchTeamId,
    pitchSelection,
    dismissExpiredAlert,
    dismissPitchSelection,
  };
}
