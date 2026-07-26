"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, RotateCcw, Timer } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MODE_SECONDS,
  broadcastTimerEvent,
  formatTimerClock,
  sessionTimerChannelName,
  type TimerMode,
} from "@/lib/timer/session-timer";

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

type LiveTimerHostProps = {
  sessionId: string;
  className?: string;
};

export function LiveTimerHost({ sessionId, className = "" }: LiveTimerHostProps) {
  const [mode, setMode] = useState<TimerMode>("solo_brainstorm");
  const [remaining, setRemaining] = useState(MODE_SECONDS.solo_brainstorm);
  const [running, setRunning] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const chimedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const modeRef = useRef(mode);
  const endsAtRef = useRef<number | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const duration = MODE_SECONDS[mode];
  const progress = remaining / duration;
  const isUrgent = remaining > 0 && remaining <= 10;
  const isDone = remaining === 0;

  const ringColor = useMemo(() => {
    if (isDone || isUrgent) return "#f43f5e";
    if (progress <= 0.33) return "#eab308";
    return "#22c55e";
  }, [isDone, isUrgent, progress]);

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

  const startMode = useCallback((next: TimerMode, seconds?: number) => {
    const secs = seconds ?? MODE_SECONDS[next];
    const endsAt = Date.now() + secs * 1000;
    endsAtRef.current = endsAt;
    setMode(next);
    setRemaining(secs);
    chimedRef.current = false;
    setRunning(true);
    void broadcastTimerEvent(channelRef.current, "TIMER_STARTED", {
      mode: next,
      secondsRemaining: secs,
      endsAt,
    });
  }, []);

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
    playChime();
    void broadcastTimerEvent(channelRef.current, "TIMER_EXPIRED", {
      mode: expiredMode,
      secondsRemaining: 0,
    });
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

  const size = 148;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`rounded-3xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_0_50px_-20px_rgba(45,212,191,0.35)] backdrop-blur-xl xl:p-5 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-[family-name:var(--font-noto-georgian)] text-sm font-bold tracking-wide text-slate-200">
          <Timer className="size-4 text-teal-300" />
          ⏱️ ტაიმერი
        </div>
        <span
          className={`size-2 rounded-full ${channelReady ? "bg-emerald-400" : "bg-slate-600"}`}
          title={channelReady ? "არხი მზადაა" : "იკავშირება…"}
        />
      </div>

      <div className="mb-3 flex flex-col gap-1.5 rounded-xl bg-slate-950/80 p-1.5 ring-1 ring-slate-700">
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

      <p className="mb-1 text-center font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-slate-400">
        {MODE_LABELS_KA[mode]}
        {running ? (
          <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-rose-200">
            პირდაპირ
          </span>
        ) : null}
      </p>

      <div className="relative mx-auto mb-4 flex size-[148px] items-center justify-center">
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
          className={`absolute font-mono text-4xl font-black tracking-tight tabular-nums xl:text-5xl ${
            isUrgent || isDone ? "text-rose-400" : "text-white"
          }`}
          initial={{ scale: 1 }}
          animate={isUrgent ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={isUrgent ? { duration: 0.55, repeat: Infinity } : undefined}
        >
          {formatTimerClock(remaining)}
        </motion.p>
      </div>

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-800">
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

      <div className="flex items-center justify-center gap-2">
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
    </div>
  );
}
