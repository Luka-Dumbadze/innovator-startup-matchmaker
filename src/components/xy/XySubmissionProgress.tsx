"use client";

import { useMemo } from "react";

import { computeSubmissionProgress } from "@/lib/xy/scoring";
import type { XYIndividualVote, XYPlayer, XYTeam } from "@/types/xy";

type XySubmissionProgressProps = {
  round: number;
  players: XYPlayer[];
  teams: XYTeam[];
  individualVotes: XYIndividualVote[];
  /** Mentor override for a student's phone vote in this round. */
  onOverride: (playerId: string, vote: "X" | "Y" | null) => void;
  pendingPlayerId: string | null;
};

/** Live "38 / 40" counter plus the per-student submitted / pending table. */
export function XySubmissionProgress({
  round,
  players,
  teams,
  individualVotes,
  onOverride,
  pendingPlayerId,
}: XySubmissionProgressProps) {
  const progress = useMemo(
    () => computeSubmissionProgress(players, individualVotes, round),
    [individualVotes, players, round]
  );

  const teamNameById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  );

  const voteByPlayerId = useMemo(() => {
    const map = new Map<string, XYIndividualVote>();
    for (const vote of individualVotes) {
      if (vote.round_number === round) {
        map.set(vote.player_id, vote);
      }
    }
    return map;
  }, [individualVotes, round]);

  const percent =
    progress.total === 0 ? 0 : Math.round((progress.submitted / progress.total) * 100);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-noto-georgian)] text-base font-black text-white">
          ხმების პროგრესი · რაუნდი #{round}
        </h2>
        <p className="font-[family-name:var(--font-noto-georgian)] text-lg font-black text-teal-300">
          {progress.label}
        </p>
      </div>

      <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-teal-500 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {players.length === 0 ? (
        <p className="font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
          სტუდენტები ჯერ არ შემოსულან.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">სტუდენტი</th>
                <th className="px-3 py-2 font-semibold">გუნდი</th>
                <th className="px-3 py-2 font-semibold">სტატუსი</th>
                <th className="px-3 py-2 text-right font-semibold">კორექცია</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {players.map((player) => {
                const vote = voteByPlayerId.get(player.id);
                const busy = pendingPlayerId === player.id;

                return (
                  <tr key={player.id} className="bg-slate-950/40">
                    <td className="px-3 py-2 font-[family-name:var(--font-noto-georgian)] text-slate-100">
                      {player.full_name}
                    </td>
                    <td className="px-3 py-2 font-[family-name:var(--font-noto-georgian)] text-slate-400">
                      {player.team_id ? teamNameById.get(player.team_id) ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {vote ? (
                        <span className="font-[family-name:var(--font-noto-georgian)] text-emerald-300">
                          ✓ მისცა ხმა ({vote.vote})
                          {vote.edited_by_mentor ? (
                            <span className="ml-1 text-amber-300">✎</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="font-[family-name:var(--font-noto-georgian)] text-amber-300">
                          ⏳ ელოდება
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {(["X", "Y"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={busy}
                            onClick={() => onOverride(player.id, option)}
                            className={`size-8 rounded-lg border font-black transition disabled:opacity-40 ${
                              vote?.vote === option
                                ? option === "X"
                                  ? "border-rose-400 bg-rose-500/20 text-rose-200"
                                  : "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                                : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={busy || !vote}
                          onClick={() => onOverride(player.id, null)}
                          aria-label="Clear vote"
                          title={`წაშლის ხმას რაუნდი #${round}-ისთვის`}
                          className="size-8 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
                        >
                          ⌫
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
