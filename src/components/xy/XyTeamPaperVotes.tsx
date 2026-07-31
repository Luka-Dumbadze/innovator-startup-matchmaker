"use client";

import { useMemo } from "react";

import { XY_MATRIX_LEGEND, XY_TEAM_COUNT, scoreRound } from "@/lib/xy/scoring";
import type { XYTeam, XYTeamVote, XYVote } from "@/types/xy";

type XyTeamPaperVotesProps = {
  round: number;
  teams: XYTeam[];
  teamVotes: XYTeamVote[];
  pendingTeamId: string | null;
  onSetVote: (teamId: string, vote: XYVote | null) => void;
};

/** Mentor enters the 8 paper decisions; points recompute for the whole round. */
export function XyTeamPaperVotes({
  round,
  teams,
  teamVotes,
  pendingTeamId,
  onSetVote,
}: XyTeamPaperVotesProps) {
  const roundVotes = useMemo(
    () => teamVotes.filter((v) => v.round_number === round),
    [round, teamVotes]
  );

  const voteByTeamId = useMemo(
    () => new Map(roundVotes.map((v) => [v.team_id, v])),
    [roundVotes]
  );

  const score = useMemo(
    () => scoreRound(roundVotes.map((v) => v.vote)),
    [roundVotes]
  );

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-noto-georgian)] text-base font-black text-white">
          გუნდების ქაღალდის ხმები · რაუნდი #{round}
        </h2>
        <p
          className={`font-[family-name:var(--font-noto-georgian)] text-sm font-bold ${
            score.complete ? "text-teal-300" : "text-amber-300"
          }`}
        >
          {score.yCount}Y / {score.xCount}X ·{" "}
          {score.complete
            ? `Y: ${score.payoff.yPoints > 0 ? "+" : ""}${score.payoff.yPoints} · X: ${
                score.payoff.xPoints > 0 ? "+" : ""
              }${score.payoff.xPoints}`
            : `ჯერ ${XY_TEAM_COUNT - roundVotes.length} გუნდი აკლია`}
        </p>
      </div>

      <div className="grid gap-2">
        {teams.map((team) => {
          const vote = voteByTeamId.get(team.id);
          const busy = pendingTeamId === team.id;

          return (
            <div
              key={team.id}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <span className="flex-1 truncate font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-slate-100">
                #{team.team_number} {team.name}
              </span>

              <span
                className={`w-14 text-right font-[family-name:var(--font-jetbrains)] text-sm font-black ${
                  (vote?.points ?? 0) > 0
                    ? "text-emerald-300"
                    : (vote?.points ?? 0) < 0
                      ? "text-rose-300"
                      : "text-slate-500"
                }`}
              >
                {vote ? `${vote.points > 0 ? "+" : ""}${vote.points}` : "—"}
              </span>

              <div className="flex gap-1.5">
                {(["X", "Y"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => onSetVote(team.id, option)}
                    className={`size-10 rounded-xl border-2 text-base font-black transition disabled:opacity-40 ${
                      vote?.vote === option
                        ? option === "X"
                          ? "border-rose-400 bg-rose-500/25 text-rose-100"
                          : "border-emerald-400 bg-emerald-500/25 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {option}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy || !vote}
                  onClick={() => onSetVote(team.id, null)}
                  aria-label="Clear paper vote"
                  className="size-10 rounded-xl border-2 border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
                >
                  ⌫
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
        <summary className="cursor-pointer font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-slate-400">
          ქულების მატრიცა
        </summary>
        <div className="mt-2 grid gap-1 font-[family-name:var(--font-jetbrains)] text-xs text-slate-400 sm:grid-cols-3">
          {XY_MATRIX_LEGEND.map((row) => (
            <p key={row.label}>
              {row.label} → Y: {row.yPoints > 0 ? "+" : ""}
              {row.yPoints} / X: {row.xPoints > 0 ? "+" : ""}
              {row.xPoints}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
