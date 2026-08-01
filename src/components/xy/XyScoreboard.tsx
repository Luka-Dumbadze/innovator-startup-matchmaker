"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { useXyLiveSession } from "@/hooks/useXyLiveSession";
import { XY_MATRIX_LEGEND } from "@/lib/xy/scoring";
import { toScoreboardSafeView } from "@/lib/xy/student-privacy";

/**
 * Projector board for live play: cumulative totals only.
 * Round-by-round paper decisions stay on /admin/xy and /xy/analytics.
 */
export function XyScoreboard() {
  const live = useXyLiveSession();

  const board = useMemo(
    () =>
      toScoreboardSafeView({
        session: live.session,
        teams: live.teams,
        teamVotes: live.teamVotes,
      }),
    [live.session, live.teamVotes, live.teams]
  );

  if (live.loading && !live.session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-10 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="font-[family-name:var(--font-noto-georgian)] text-3xl font-black text-slate-300">
          აქტიური XY სესია არ არის
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-8 xl:px-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-[0.2em] text-teal-400 uppercase">
            Win-Win Simulation
          </p>
          <h1 className="font-[family-name:var(--font-noto-georgian)] text-4xl font-black text-white xl:text-5xl">
            {board.sessionTitle}
          </h1>
        </div>
        <div
          className={`rounded-2xl px-5 py-3 font-[family-name:var(--font-noto-georgian)] text-2xl font-black ${
            board.votingOpen
              ? "bg-emerald-500/15 text-emerald-200 ring-2 ring-emerald-500/40"
              : "bg-slate-800 text-slate-300 ring-2 ring-slate-700"
          }`}
        >
          მიმდინარე რაუნდი: #{board.currentRound}
          {board.votingOpen ? " · ღიაა" : " · დახურული"}
        </div>
      </header>

      <ol className="mb-10 grid gap-3">
        {board.standings.map((row, index) => (
          <motion.li
            key={row.teamId}
            layout
            className="flex items-center gap-4 rounded-3xl border border-slate-700 bg-slate-900/80 px-5 py-4 xl:px-7 xl:py-5"
          >
            <span className="w-12 font-[family-name:var(--font-jetbrains)] text-3xl font-black text-slate-500 xl:text-4xl">
              {index + 1}
            </span>
            <span
              className="size-6 shrink-0 rounded-full ring-2 ring-white/10 xl:size-7"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            <span className="flex-1 truncate font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-white xl:text-4xl">
              {row.name}
            </span>
            <span
              className={`font-[family-name:var(--font-noto-georgian)] text-2xl font-black xl:text-4xl ${
                row.totalPoints > 0
                  ? "text-emerald-300"
                  : row.totalPoints < 0
                    ? "text-rose-300"
                    : "text-slate-400"
              }`}
            >
              {row.totalPoints > 0 ? "+" : ""}
              {row.totalPoints} ქულა
            </span>
          </motion.li>
        ))}
      </ol>

      <section className="rounded-3xl border border-slate-700 bg-slate-900/60 p-5 xl:p-6">
        <h2 className="mb-4 font-[family-name:var(--font-noto-georgian)] text-xl font-black text-white xl:text-2xl">
          ქულების მატრიცა
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {XY_MATRIX_LEGEND.map((row) => (
            <p
              key={row.label}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 font-[family-name:var(--font-jetbrains)] text-sm text-slate-300 xl:text-base"
            >
              <span className="font-black text-slate-100">{row.label}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="text-emerald-300">
                Y {row.yPoints > 0 ? "+" : ""}
                {row.yPoints}
              </span>
              <span className="mx-1.5 text-slate-600">/</span>
              <span className="text-rose-300">
                X {row.xPoints > 0 ? "+" : ""}
                {row.xPoints}
              </span>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
