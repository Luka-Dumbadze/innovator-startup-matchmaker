"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, RotateCcw, Timer, Mic2 } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { hostTeamTitle } from "@/lib/constants/host-labels";
import { TOOL_SLOT_META } from "@/lib/constants/preset-words";
import {
  MODE_SECONDS,
  broadcastTimerEvent,
  formatTimerClock,
  sessionTimerChannelName,
  type TimerMode,
} from "@/lib/timer/session-timer";
import type { Team } from "@/types/game";

/** Short descending chime via Web Audio API (host local feedback). */
function playChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [880, 1174.66, 1318.51];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // Autoplay / unsupported — ignore.
  }
}

const START_BUTTONS: { mode: TimerMode; label: string }[] = [
  { mode: "solo_brainstorm", label: "▶️ 2-წთ ინდივიდუალური დაწყება" },
  { mode: "team_brainstorm", label: "▶️ 10-წთ გუნდური დაწყება" },
  { mode: "pitch", label: "▶️ 1-წთ პიჩის დაწყება" },
];

const MODE_LABELS_KA: Record<TimerMode, string> = {
  solo_brainstorm: "🤫 ინდივიდუალური ბრეინსტორმი",
  team_brainstorm: "🤝 გუნდური ბრეინსტორმი",
  pitch: "🎤 პიჩინგი",
};

type ProjectedPitch = {
  startupName: string;
  oneSentenceSolution: string;
  toolsIntegration: string;
  authorNickname: string;
};

type LiveTimerHostProps = {
  sessionId: string;
  teams: Team[];
  className?: string;
};

export function LiveTimerHost({
  sessionId,
  teams,
  className = "",
}: LiveTimerHostProps) {
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.team_number - b.team_number),
    [teams]
  );

  const [mode, setMode] = useState<TimerMode>("solo_brainstorm");
  const [remaining, setRemaining] = useState(MODE_SECONDS.solo_brainstorm);
  const [running, setRunning] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [projectedPitch, setProjectedPitch] = useState<ProjectedPitch | null>(null);
  const [pitchLoading, setPitchLoading] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);

  const chimedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const modeRef = useRef(mode);
  const endsAtRef = useRef<number | null>(null);
  const selectedTeamIdRef = useRef<string | null>(null);

  const effectiveSelectedId = selectedTeamId ?? sortedTeams[0]?.id ?? null;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    selectedTeamIdRef.current = effectiveSelectedId;
  }, [effectiveSelectedId]);

  const selectedTeam =
    sortedTeams.find((t) => t.id === effectiveSelectedId) ?? sortedTeams[0] ?? null;
  const selectedIndex = selectedTeam
    ? sortedTeams.findIndex((t) => t.id === selectedTeam.id)
    : -1;
  const nextTeam =
    selectedIndex >= 0 ? sortedTeams[(selectedIndex + 1) % sortedTeams.length] ?? null : null;

  const duration = MODE_SECONDS[mode];
  const progress = remaining / duration;
  const isUrgent = remaining > 0 && remaining <= 10;
  const isDone = remaining === 0;
  const showPitchProjection = mode === "pitch" && (running || remaining === 0);

  const ringColor = useMemo(() => {
    if (isDone || isUrgent) return "#f43f5e";
    if (progress <= 0.33) return "#eab308";
    return "#22c55e";
  }, [isDone, isUrgent, progress]);

  const loadPitchForTeam = useCallback(
    async (teamId: string) => {
      setPitchLoading(true);
      setPitchError(null);
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from("submitted_ideas")
          .select(
            "startup_name, one_sentence_solution, tools_integration, author_nickname"
          )
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("is_final_team_pitch", true)
          .maybeSingle();

        if (error) throw new Error(error.message);

        if (!data) {
          setProjectedPitch(null);
          setPitchError("ფინალური პიჩი ჯერ არ არის შენახული");
          return;
        }

        setProjectedPitch({
          startupName: data.startup_name,
          oneSentenceSolution: data.one_sentence_solution,
          toolsIntegration: data.tools_integration,
          authorNickname: data.author_nickname,
        });
      } catch (err) {
        setProjectedPitch(null);
        setPitchError(err instanceof Error ? err.message : "პიჩის ჩატვირთვა ვერ მოხერხდა");
      } finally {
        setPitchLoading(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(sessionTimerChannelName(sessionId), {
      config: { broadcast: { self: false } },
    });

    channel.subscribe((status) => {
      setChannelReady(status === "SUBSCRIBED");
    });

    channelRef.current = channel;

    return () => {
      setChannelReady(false);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const clearTick = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startMode = useCallback(
    (next: TimerMode, seconds?: number) => {
      if (next === "pitch" && !selectedTeamIdRef.current) {
        setPitchError("ჯერ აირჩიეთ გუნდი პიჩისთვის");
        return;
      }

      const secs = seconds ?? MODE_SECONDS[next];
      const endsAt = Date.now() + secs * 1000;
      endsAtRef.current = endsAt;
      setMode(next);
      setRemaining(secs);
      chimedRef.current = false;
      setRunning(true);

      const activeTeam = sortedTeams.find((t) => t.id === selectedTeamIdRef.current);
      const teamName = activeTeam
        ? hostTeamTitle(activeTeam.team_number, activeTeam.name)
        : undefined;

      void broadcastTimerEvent(channelRef.current, "TIMER_STARTED", {
        mode: next,
        secondsRemaining: secs,
        endsAt,
        ...(next === "pitch" && selectedTeamIdRef.current
          ? { activeTeamId: selectedTeamIdRef.current, teamName }
          : {}),
      });

      if (next === "pitch" && selectedTeamIdRef.current && teamName) {
        void loadPitchForTeam(selectedTeamIdRef.current);
        void broadcastTimerEvent(channelRef.current, "PITCH_STARTED", {
          activeTeamId: selectedTeamIdRef.current,
          teamName,
          secondsRemaining: secs,
          endsAt,
        });
      }
    },
    [sortedTeams, loadPitchForTeam]
  );

  useEffect(() => {
    if (!running) {
      clearTick();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const endsAt = endsAtRef.current;
      if (endsAt != null) {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) {
          clearTick();
          setRunning(false);
        }
        return;
      }

      setRemaining((prev) => {
        if (prev <= 1) {
          clearTick();
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 250);

    return clearTick;
  }, [running]);

  useEffect(() => {
    if (remaining !== 0 || chimedRef.current || running) {
      if (remaining > 0) chimedRef.current = false;
      return;
    }

    chimedRef.current = true;
    endsAtRef.current = null;
    const expiredMode = modeRef.current;
    const targetTeamId = selectedTeamIdRef.current ?? undefined;
    playChime();
    void broadcastTimerEvent(channelRef.current, "TIMER_EXPIRED", {
      mode: expiredMode,
      secondsRemaining: 0,
      ...(expiredMode === "pitch" && targetTeamId ? { targetTeamId } : {}),
    });

    if (expiredMode === "pitch" && targetTeamId) {
      void broadcastTimerEvent(channelRef.current, "PITCH_EXPIRED", {
        targetTeamId,
      });
    }
  }, [remaining, running]);

  const reset = () => {
    endsAtRef.current = null;
    setRunning(false);
    setRemaining(duration);
    chimedRef.current = false;
    void broadcastTimerEvent(channelRef.current, "TIMER_RESET", {
      mode,
      secondsRemaining: duration,
    });
  };

  const pause = () => {
    if (!running) return;
    endsAtRef.current = null;
    setRunning(false);
    void broadcastTimerEvent(channelRef.current, "TIMER_PAUSED", {
      mode,
      secondsRemaining: remaining,
    });
  };

  const size = 160;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 overflow-auto rounded-3xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_0_50px_-20px_rgba(45,212,191,0.35)] backdrop-blur-xl xl:p-5 ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-[family-name:var(--font-noto-georgian)] text-sm font-bold tracking-wide text-slate-200">
          <Timer className="size-4 text-teal-300" />
          ⏱️ ტაიმერი
        </div>
        <span
          className={`size-2 rounded-full ${channelReady ? "bg-emerald-400" : "bg-slate-600"}`}
          title={channelReady ? "არხი მზადაა" : "იკავშირება…"}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 rounded-xl bg-slate-950/80 p-1.5 ring-1 ring-slate-700">
        {START_BUTTONS.map(({ mode: key, label }) => {
          const active = mode === key && (running || remaining < MODE_SECONDS[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => startMode(key)}
              className={`rounded-lg px-2.5 py-2.5 text-left font-[family-name:var(--font-noto-georgian)] text-xs font-bold transition xl:text-sm ${
                active
                  ? "bg-teal-500 text-slate-950 ring-2 ring-teal-300/60"
                  : "bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Team pitch selector */}
      <div className="shrink-0 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
        <p className="mb-2 font-[family-name:var(--font-noto-georgian)] text-xs font-bold tracking-wide text-amber-200 uppercase">
          🎤 პიჩის გუნდი
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {sortedTeams.map((team) => {
            const selected = team.id === selectedTeam?.id;
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => {
                  setSelectedTeamId(team.id);
                  if (mode === "pitch") {
                    void loadPitchForTeam(team.id);
                  }
                }}
                className={`rounded-lg px-2 py-2 text-left font-[family-name:var(--font-noto-georgian)] text-[11px] font-bold leading-snug transition xl:text-xs ${
                  selected
                    ? "bg-amber-400 text-slate-950 ring-2 ring-amber-200"
                    : "bg-slate-950/70 text-slate-200 ring-1 ring-slate-700 hover:bg-slate-800"
                }`}
              >
                {hostTeamTitle(team.team_number, team.name)}
              </button>
            );
          })}
        </div>
        {nextTeam && selectedTeam && nextTeam.id !== selectedTeam.id ? (
          <p className="mt-2 font-[family-name:var(--font-noto-georgian)] text-xs text-amber-100/80">
            Next Up: {hostTeamTitle(nextTeam.team_number, nextTeam.name)}
          </p>
        ) : null}
      </div>

      <p className="shrink-0 text-center font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-slate-400">
        {MODE_LABELS_KA[mode]}
        {running ? (
          <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-rose-200">
            პირდაპირ
          </span>
        ) : null}
      </p>

      <div className="relative mx-auto flex size-[160px] shrink-0 items-center justify-center">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: dashOffset, opacity: 1 }}
            animate={{
              strokeDashoffset: dashOffset,
              opacity: isUrgent ? [1, 0.45, 1] : 1,
            }}
            transition={
              isUrgent
                ? { opacity: { duration: 0.55, repeat: Infinity }, strokeDashoffset: { duration: 0.35 } }
                : { strokeDashoffset: { duration: 0.35 } }
            }
          />
        </svg>
        <motion.p
          className={`absolute font-mono text-5xl font-black tracking-tight tabular-nums ${
            isUrgent || isDone ? "text-rose-400" : "text-white"
          }`}
          initial={{ scale: 1 }}
          animate={isUrgent ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={isUrgent ? { duration: 0.55, repeat: Infinity } : undefined}
        >
          {formatTimerClock(remaining)}
        </motion.p>
      </div>

      <div className="h-2 shrink-0 overflow-hidden rounded-full bg-slate-800">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: ringColor }}
          initial={{ width: `${progress * 100}%`, opacity: 1 }}
          animate={{
            width: `${progress * 100}%`,
            opacity: isUrgent ? [1, 0.5, 1] : 1,
          }}
          transition={
            isUrgent
              ? { opacity: { duration: 0.55, repeat: Infinity }, width: { duration: 0.3 } }
              : { width: { duration: 0.3 } }
          }
        />
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          onClick={pause}
          disabled={!running}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-white ring-1 ring-slate-600 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pause className="size-4" />
          ⏸️ პაუზა
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-white ring-1 ring-slate-600 transition hover:bg-slate-700"
        >
          <RotateCcw className="size-4" />
          🔄 გადატვირთვა
        </button>
      </div>

      {/* Live pitch projection */}
      <AnimatePresence>
        {showPitchProjection ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="min-h-0 flex-1 overflow-auto rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-500/15 to-slate-950/90 p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <Mic2 className="size-5 text-amber-300" />
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-amber-300 uppercase">
                  Live Pitch Projection
                </p>
                <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-black text-white">
                  {selectedTeam
                    ? hostTeamTitle(selectedTeam.team_number, selectedTeam.name)
                    : "—"}
                </p>
              </div>
            </div>

            {pitchLoading ? (
              <p className="text-sm text-slate-400">პიჩი იტვირთება…</p>
            ) : pitchError && !projectedPitch ? (
              <p className="font-[family-name:var(--font-noto-georgian)] text-sm text-amber-200/90">
                {pitchError}
              </p>
            ) : projectedPitch ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                    Startup
                  </p>
                  <p className="text-2xl font-black text-white xl:text-3xl">
                    {projectedPitch.startupName}
                  </p>
                </div>
                {selectedTeam ? (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/70 px-3 py-2">
                    <p className="text-[10px] font-bold text-indigo-200 uppercase">
                      🌍 გამოწვევა
                    </p>
                    <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-amber-300">
                      {selectedTeam.domain || "—"}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                    1-Sentence Solution
                  </p>
                  <p className="font-[family-name:var(--font-noto-georgian)] text-base leading-relaxed text-slate-100 xl:text-lg">
                    {projectedPitch.oneSentenceSolution}
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                    3 Tools
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {TOOL_SLOT_META.map((slot, i) => (
                      <div
                        key={slot.label}
                        className="rounded-lg bg-slate-950/80 px-2 py-2 text-center ring-1 ring-slate-700"
                      >
                        <p className="text-xs" aria-hidden>
                          {slot.icon}
                        </p>
                        <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-xs font-semibold text-teal-200">
                          {selectedTeam?.words[i] ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-300">
                    {projectedPitch.toolsIntegration}
                  </p>
                </div>
                <p className="text-[10px] text-slate-500">
                  @{projectedPitch.authorNickname}
                </p>
              </div>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
