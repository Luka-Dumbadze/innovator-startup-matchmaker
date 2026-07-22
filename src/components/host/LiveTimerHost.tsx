"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";

export type TimerMode = "brainstorm" | "pitch";

const MODE_SECONDS: Record<TimerMode, number> = {
  brainstorm: 12 * 60,
  pitch: 60,
};

const MODE_LABELS: Record<TimerMode, string> = {
  brainstorm: "12-Min Brainstorm",
  pitch: "1-Min Pitch",
};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Short descending chime via Web Audio API (no asset files). */
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

type LiveTimerHostProps = {
  className?: string;
};

export function LiveTimerHost({ className = "" }: LiveTimerHostProps) {
  const [mode, setMode] = useState<TimerMode>("brainstorm");
  const [remaining, setRemaining] = useState(MODE_SECONDS.brainstorm);
  const [running, setRunning] = useState(false);
  const chimedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const duration = MODE_SECONDS[mode];
  const progress = remaining / duration;
  const isUrgent = remaining > 0 && remaining <= 10;
  const isDone = remaining === 0;

  const ringColor = useMemo(() => {
    if (isDone || isUrgent) return "#f43f5e";
    if (progress <= 0.33) return "#eab308";
    return "#22c55e";
  }, [isDone, isUrgent, progress]);

  const clearTick = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!running) {
      clearTick();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTick();
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTick;
  }, [running]);

  useEffect(() => {
    if (remaining === 0 && !chimedRef.current) {
      chimedRef.current = true;
      playChime();
    }
    if (remaining > 0) {
      chimedRef.current = false;
    }
  }, [remaining]);

  const switchMode = useCallback((next: TimerMode) => {
    setMode(next);
    setRunning(false);
    setRemaining(MODE_SECONDS[next]);
    chimedRef.current = false;
  }, []);

  const reset = () => {
    setRunning(false);
    setRemaining(duration);
    chimedRef.current = false;
  };

  const size = 148;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`rounded-3xl border border-slate-700/80 bg-slate-900/90 p-4 xl:p-5 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold tracking-[0.16em] text-slate-300 uppercase">
          <Timer className="size-4 text-teal-300" />
          Live timer
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-950 p-1 ring-1 ring-slate-700">
          {(Object.keys(MODE_LABELS) as TimerMode[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition xl:text-sm ${
                mode === key
                  ? "bg-teal-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {key === "brainstorm" ? "12-Min" : "1-Min"}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-center text-sm font-semibold text-slate-400">
        {MODE_LABELS[mode]}
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
          {formatTime(remaining)}
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
          onClick={() => {
            if (remaining === 0) {
              setRemaining(duration);
              chimedRef.current = false;
            }
            setRunning((r) => !r);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-400"
        >
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          {running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-slate-600 transition hover:bg-slate-700"
        >
          <RotateCcw className="size-4" />
          Reset
        </button>
      </div>
    </div>
  );
}
