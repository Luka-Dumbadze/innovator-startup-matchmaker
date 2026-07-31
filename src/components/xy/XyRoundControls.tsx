"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type XyRoundControlsProps = {
  round: number;
  currentRound: number;
  votingOpen: boolean;
  pending: boolean;
  maxRound: number;
  onRoundChange: (round: number) => void;
  onOpen: () => void;
  onClose: () => void;
};

/** Mentor-only round trigger — no timers anywhere in the XY game. */
export function XyRoundControls({
  round,
  currentRound,
  votingOpen,
  pending,
  maxRound,
  onRoundChange,
  onOpen,
  onClose,
}: XyRoundControlsProps) {
  const isActiveRound = round === currentRound;
  const openDisabled = pending || (votingOpen && isActiveRound);
  const closeDisabled = pending || !votingOpen;

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRoundChange(Math.max(1, round - 1))}
            disabled={round <= 1}
            aria-label="Previous round"
            className="flex size-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-24 text-center">
            <p className="text-xs font-bold tracking-[0.16em] text-slate-500 uppercase">
              რაუნდი
            </p>
            <p className="font-[family-name:var(--font-jetbrains)] text-2xl font-black text-white">
              #{round}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRoundChange(round + 1)}
            disabled={round >= maxRound}
            aria-label="Next round"
            className="flex size-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isActiveRound ? (
            <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-teal-200">
              აქტიური რაუნდი
            </span>
          ) : (
            <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-slate-300">
              არქივი (აქტიური: #{currentRound})
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 font-[family-name:var(--font-noto-georgian)] text-xs font-bold ${
              votingOpen
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border border-slate-600 bg-slate-800 text-slate-400"
            }`}
          >
            {votingOpen ? "🗳️ ხმის მიცემა ღიაა" : "🔒 დახურულია"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={openDisabled}
          className="flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 font-[family-name:var(--font-noto-georgian)] text-base font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            `▶️ დაიწყე რაუნდი #${round}`
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          className="flex min-h-14 items-center justify-center rounded-2xl border-2 border-slate-500 bg-slate-800 px-4 py-3 font-[family-name:var(--font-noto-georgian)] text-base font-black text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            `🔒 დახურე რაუნდი #${currentRound}`
          )}
        </button>
      </div>
    </section>
  );
}
