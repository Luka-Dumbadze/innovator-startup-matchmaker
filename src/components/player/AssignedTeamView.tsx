"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Timer, Users, X } from "lucide-react";

import type { DailySession, Team } from "@/types/game";
import { IdeaNotesCanvas } from "@/components/player/IdeaNotesCanvas";
import { TimerExpiredModal } from "@/components/player/TimerExpiredModal";
import { useSessionTimerSync } from "@/hooks/useSessionTimerSync";
import {
  MODE_SECONDS,
  MODE_SHORT_LABELS,
  PHASE_GUIDANCE,
  formatTimerClock,
  type TimerMode,
} from "@/lib/timer/session-timer";

type AssignedTeamViewProps = {
  session: DailySession;
  team: Team;
  onToast?: (message: string, tone?: "success" | "error") => void;
};

const BANNER_STYLES: Record<
  TimerMode,
  { wrap: string; title: string; body: string }
> = {
  solo_brainstorm: {
    wrap: "border-violet-400/40 bg-violet-500/15",
    title: "text-violet-100",
    body: "text-violet-200/90",
  },
  team_brainstorm: {
    wrap: "border-teal-400/40 bg-teal-500/15",
    title: "text-teal-100",
    body: "text-teal-200/90",
  },
  pitch: {
    wrap: "border-amber-400/40 bg-amber-500/15",
    title: "text-amber-100",
    body: "text-amber-200/90",
  },
};

export function AssignedTeamView({ session, team, onToast }: AssignedTeamViewProps) {
  const isFull = team.current_count >= team.max_capacity;
  const timer = useSessionTimerSync(session.id);
  const guidance = PHASE_GUIDANCE[timer.mode];
  const bannerStyle = BANNER_STYLES[timer.mode];

  // Unlock audio context on first user gesture so alarm / chimes can play later.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        void ctx.resume().then(() => void ctx.close());
      } catch {
        // ignore
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  const timerUrgent = timer.secondsRemaining > 0 && timer.secondsRemaining <= 10;
  const timerActive =
    timer.running || timer.secondsRemaining < MODE_SECONDS[timer.mode];

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 py-6 pb-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="text-[11px] font-bold tracking-[0.2em] text-teal-400 uppercase">
          {session.date_label}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">You&apos;re in!</h1>

        {(timer.running || timerActive || timer.expiredAlert) && (
          <motion.div
            layout
            className={`mt-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-sm font-black tabular-nums ring-1 ${
              timer.expiredAlert || timer.secondsRemaining === 0
                ? "bg-rose-500/20 text-rose-300 ring-rose-400/50"
                : timerUrgent
                  ? "bg-amber-500/20 text-amber-200 ring-amber-400/40"
                  : "bg-slate-800 text-teal-200 ring-slate-600"
            }`}
          >
            <Timer className="size-3.5" />
            {formatTimerClock(timer.secondsRemaining)}
            <span className="text-[10px] font-bold tracking-wide uppercase opacity-80">
              {MODE_SHORT_LABELS[timer.mode]}
              {timer.running ? " · LIVE" : ""}
            </span>
          </motion.div>
        )}
      </motion.header>

      <AnimatePresence mode="wait">
        {(timer.running || timerActive) && (
          <motion.div
            key={timer.mode}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className={`rounded-2xl border px-4 py-3 text-left ${bannerStyle.wrap}`}
          >
            <p
              className={`font-[family-name:var(--font-noto-georgian)] text-base font-black leading-snug ${bannerStyle.title}`}
            >
              {guidance.title}
            </p>
            <p
              className={`mt-1 font-[family-name:var(--font-noto-georgian)] text-sm leading-relaxed ${bannerStyle.body}`}
            >
              {guidance.instruction}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {timer.phaseTransitionNotice ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-2xl border border-amber-400/50 bg-amber-500/20 px-3.5 py-3 text-left"
          >
            <p className="flex-1 font-[family-name:var(--font-noto-georgian)] text-sm font-bold leading-snug text-amber-50">
              {timer.phaseTransitionNotice}
            </p>
            <button
              type="button"
              onClick={timer.clearPhaseTransitionNotice}
              className="rounded-md p-0.5 text-amber-200/80"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_0_40px_-12px_rgba(45,212,191,0.35)]"
        style={{ borderTopWidth: 5, borderTopColor: team.color }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-bold text-slate-300 ring-1 ring-slate-700">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                Team {team.team_number}
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white">{team.name}</h2>
            </div>
            <div className="rounded-2xl bg-slate-950/80 px-3 py-2 text-right ring-1 ring-slate-700">
              <p className="flex items-center justify-end gap-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                <Users className="size-3" />
                Seats
              </p>
              <p className="font-mono text-lg font-black tabular-nums text-white">
                {team.current_count}
                <span className="text-slate-500">/{team.max_capacity}</span>
              </p>
              {isFull ? (
                <p className="text-[10px] font-bold text-emerald-400">FULL</p>
              ) : null}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-2xl bg-amber-500/15 px-4 py-4 ring-1 ring-amber-400/40"
          >
            <p className="text-xs font-bold tracking-[0.14em] text-amber-200/90 uppercase">
              🎯 სამიზნე სფერო
            </p>
            <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-xl font-black leading-snug text-amber-50">
              {team.domain || "—"}
            </p>
          </motion.div>

          <p className="mt-4 mb-2 text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
            🔑 3 საკვანძო სიტყვა
          </p>
          <div className="grid grid-cols-3 gap-2">
            {team.words.map((word, index) => (
              <motion.div
                key={`${word}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index }}
                className="rounded-2xl px-2 py-4 text-center ring-1 ring-white/10"
                style={{
                  background: `linear-gradient(160deg, ${team.color}33, #020617 70%)`,
                }}
              >
                <p className="font-[family-name:var(--font-noto-georgian)] text-base font-bold leading-snug text-white">
                  {word}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <IdeaNotesCanvas
        key={session.id}
        sessionId={session.id}
        domain={team.domain}
        words={team.words}
        onCopied={(msg) => onToast?.(msg, "success")}
        onCopyError={(msg) => onToast?.(msg, "error")}
      />

      <TimerExpiredModal
        open={timer.expiredAlert}
        onDismiss={timer.dismissExpiredAlert}
      />
    </div>
  );
}
