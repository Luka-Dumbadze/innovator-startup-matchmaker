"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { castPitchVote, type PitchVoteType } from "@/lib/supabase/client";
import { formatTimerClock } from "@/lib/timer/session-timer";
import {
  getStoredPitchVote,
  saveStoredPitchVote,
  type StoredPitchVote,
} from "@/lib/utils/player-storage";

export type VotingCardProps = {
  sessionId: string;
  teamId: string;
  teamName: string;
  teamColor?: string | null;
  voterUid: string;
  /** Voting window countdown; hidden outside voting phase. */
  secondsRemaining?: number;
  votingOpen?: boolean;
  onVoted?: (vote: PitchVoteType) => void;
};

export function VotingCard({
  sessionId,
  teamId,
  teamName,
  teamColor,
  voterUid,
  secondsRemaining = 0,
  votingOpen = false,
  onVoted,
}: VotingCardProps) {
  const [pending, startTransition] = useTransition();
  const [voted, setVoted] = useState<StoredPitchVote | null>(() =>
    getStoredPitchVote(sessionId, teamId, voterUid),
  );
  const [locked, setLocked] = useState(
    () => getStoredPitchVote(sessionId, teamId, voterUid) !== null,
  );
  const [error, setError] = useState<string | null>(null);

  const cast = (voteType: PitchVoteType) => {
    if (locked || voted || pending) return;
    setError(null);
    setLocked(true);

    try {
      navigator.vibrate?.(100);
    } catch {
      // ignore
    }

    startTransition(async () => {
      try {
        await castPitchVote({
          sessionId,
          teamId,
          voterUid,
          voteType,
        });
        saveStoredPitchVote(sessionId, teamId, voterUid, voteType);
        setVoted(voteType);
        onVoted?.(voteType);
      } catch (err) {
        setLocked(false);
        setError(err instanceof Error ? err.message : "ხმის მიცემა ვერ მოხერხდა");
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-2"
    >
      <div
        role="region"
        aria-label="პიჩის შეფასება"
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-sky-400/50 bg-slate-950/95 shadow-[0_8px_40px_-8px_rgba(56,189,248,0.55)] backdrop-blur-md"
        style={{ borderTopWidth: 5, borderTopColor: teamColor ?? "#38bdf8" }}
      >
        <div className="px-4 py-3">
          {votingOpen ? (
            <p className="text-center font-mono text-xs font-bold tabular-nums text-sky-300">
              🗳️ {formatTimerClock(secondsRemaining)}
            </p>
          ) : null}

          <h2 className="text-center font-[family-name:var(--font-noto-georgian)] text-base font-black leading-snug text-white">
            🗳️ შეაფასეთ {teamName}-ის პიჩი!
          </h2>

          <AnimatePresence mode="wait">
            {voted ? (
              <motion.p
                key="voted"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                className="mt-3 rounded-xl bg-emerald-500/20 px-3 py-3 text-center font-[family-name:var(--font-noto-georgian)] text-sm font-black text-emerald-200 ring-1 ring-emerald-400/40"
              >
                ✓ თქვენი ხმა მიღებულია!
                <span className="mt-0.5 block text-xs font-semibold text-emerald-100/80">
                  {voted === "like" ? "👍 მომეწონა / ვიყიდდი" : "👎 დახვეწა სჭირდება"}
                </span>
              </motion.p>
            ) : (
              <motion.div
                key="buttons"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                <button
                  type="button"
                  disabled={locked || pending}
                  onClick={() => cast("like")}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ThumbsUp className="size-4 shrink-0" />
                  👍 მომეწონა / ვიყიდდი
                </button>
                <button
                  type="button"
                  disabled={locked || pending}
                  onClick={() => cast("dislike")}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-500 px-3 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ThumbsDown className="size-4 shrink-0" />
                  👎 დახვეწა სჭირდება
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error ? (
            <p className="mt-2 text-center font-[family-name:var(--font-noto-georgian)] text-xs text-rose-300">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
