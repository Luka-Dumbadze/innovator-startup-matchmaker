"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { useXyLiveSession } from "@/hooks/useXyLiveSession";
import { computeStandings, resolveRoundNumbers } from "@/lib/xy/scoring";
import { resolveXySessionLabel } from "@/lib/xy/session-state";

/**
 * Projector board: team names, cumulative points and each round's paper
 * decision. Individual phone votes are deliberately never shown here.
 */
export function XyScoreboard() {
  const live = useXyLiveSession();

  const rounds = useMemo(
    () =>
      resolveRoundNumbers(
        live.individualVotes,
        live.teamVotes,
        live.session?.current_round ?? 1
      ),
    [live.individualVotes, live.session?.current_round, live.teamVotes]
  );

  const standings = useMemo(
    () => computeStandings(live.teams, live.teamVotes),
    [live.teamVotes, live.teams]
  );

  if (live.loading && !live.session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-10 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!live.session) {
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
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-[0.2em] text-teal-400 uppercase">
            Win-Win Simulation
          </p>
          <h1 className="font-[family-name:var(--font-noto-georgian)] text-4xl font-black text-white xl:text-5xl">
            {resolveXySessionLabel(live.session.label)}
          </h1>
        </div>
        <div
          className={`rounded-2xl px-5 py-3 font-[family-name:var(--font-noto-georgian)] text-2xl font-black ${
            live.session.voting_open
              ? "bg-emerald-500/15 text-emerald-200 ring-2 ring-emerald-500/40"
              : "bg-slate-800 text-slate-300 ring-2 ring-slate-700"
          }`}
        >
          რაუნდი #{live.session.current_round}{" "}
          {live.session.voting_open ? "· ღიაა" : "· დახურული"}
        </div>
      </header>

      <div className="overflow-x-auto rounded-3xl border border-slate-700 bg-slate-900/70">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-sm tracking-wide text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3 font-bold">#</th>
              <th className="px-4 py-3 font-bold">გუნდი</th>
              <th className="px-4 py-3 text-right font-bold">ქულა</th>
              {rounds.map((round) => (
                <th key={round} className="px-3 py-3 text-center font-bold">
                  R{round}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {standings.map((standing, index) => (
              <motion.tr
                key={standing.team.id}
                layout
                className="bg-slate-950/40"
              >
                <td className="px-4 py-3 font-[family-name:var(--font-jetbrains)] text-2xl font-black text-slate-500">
                  {index + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-5 shrink-0 rounded-full"
                      style={{ backgroundColor: standing.team.color }}
                    />
                    <span className="font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-white xl:text-3xl">
                      {standing.team.name}
                    </span>
                  </div>
                </td>
                <td
                  className={`px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-3xl font-black xl:text-4xl ${
                    standing.totalPoints > 0
                      ? "text-emerald-300"
                      : standing.totalPoints < 0
                        ? "text-rose-300"
                        : "text-slate-400"
                  }`}
                >
                  {standing.totalPoints > 0 ? "+" : ""}
                  {standing.totalPoints}
                </td>
                {rounds.map((round) => {
                  const vote = standing.roundVotes[round];
                  const points = standing.roundPoints[round];

                  return (
                    <td key={round} className="px-3 py-3 text-center">
                      {vote ? (
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex size-11 items-center justify-center rounded-xl text-xl font-black ${
                              vote === "Y"
                                ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40"
                                : "bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40"
                            }`}
                          >
                            {vote}
                          </span>
                          <span className="mt-1 font-[family-name:var(--font-jetbrains)] text-xs text-slate-400">
                            {(points ?? 0) > 0 ? "+" : ""}
                            {points ?? 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-2xl text-slate-700">—</span>
                      )}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
