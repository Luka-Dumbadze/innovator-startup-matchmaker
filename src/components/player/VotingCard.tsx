"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { castPitchVote, type PitchVoteType } from "@/lib/supabase/client";
import { formatTimerClock } from "@/lib/timer/session-timer";

export type VotingCardProps = {
  sessionId: string;
  teamId: string;
  teamName: string;
  teamColor?: string | null;
  voterUid: string;
  secondsRemaining: number;
  onVoted?: (vote: PitchVoteType) => void;
};

export function VotingCard({
  sessionId,
  teamId,
  teamName,
  teamColor,
  voterUid,
  secondsRemaining,
  onVoted,
}: VotingCardProps) {
  const [pending, startTransition] = useTransition();
  const [voted, setVoted] = useState<PitchVoteType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cast = (voteType: PitchVoteType) => {
    if (voted || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await castPitchVote({
          sessionId,
          teamId,
          voterUid,
          voteType,
        });
        setVoted(voteType);
        onVoted?.(voteType);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ხმის მიცემა ვერ მოხერხდა");
      }
    });
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="პიჩის შეფასება"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        initial={{ y: 36, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="w-full max-w-md rounded-3xl border border-sky-400/40 bg-gradient-to-b from-sky-500/20 to-slate-950 p-5 shadow-[0_0_50px_-10px_rgba(56,189,248,0.45)]"
        style={{
          borderTopWidth: 6,
          borderTopColor: teamColor ?? "#38bdf8",
        }}
      >
        <p className="text-center font-mono text-sm font-bold tabular-nums text-sky-300">
          🗳️ {formatTimerClock(secondsRemaining)}
        </p>
        <h2 className="mt-2 text-center font-[family-name:var(--font-noto-georgian)] text-xl font-black leading-snug text-white">
          🗳️ შეაფასეთ {teamName}-ის პიჩი!
        </h2>

        {voted ? (
          <motion.p
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mt-6 rounded-2xl bg-emerald-500/20 px-4 py-5 text-center font-[family-name:var(--font-noto-georgian)] text-lg font-black text-emerald-200 ring-1 ring-emerald-400/40"
          >
            ✓ ხმა მიღებულია!
            <span className="mt-1 block text-sm font-semibold text-emerald-100/80">
              {voted === "like" ? "👍 მომეწონა" : "👎 დახვეწა სჭირდება"}
            </span>
          </motion.p>
        ) : (
          <div className="mt-5 grid gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => cast("like")}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 font-[family-name:var(--font-noto-georgian)] text-base font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              <ThumbsUp className="size-5" />
              👍 მომეწონა / ვიყიდდი
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => cast("dislike")}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3.5 font-[family-name:var(--font-noto-georgian)] text-base font-black text-white transition hover:bg-rose-400 disabled:opacity-60"
            >
              <ThumbsDown className="size-5" />
              👎 დახვეწა სჭირდება
            </button>
          </div>
        )}

        {error ? (
          <p className="mt-3 text-center font-[family-name:var(--font-noto-georgian)] text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
