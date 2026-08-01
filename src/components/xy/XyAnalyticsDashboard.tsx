"use client";

import { useMemo } from "react";
import { Download, Loader2 } from "lucide-react";

import { useXyLiveSession } from "@/hooks/useXyLiveSession";
import {
  computeXyAnalytics,
  type XYAnalyticsCell,
} from "@/lib/xy/scoring";
import { resolveXyPlayerName } from "@/lib/xy/roster";
import { resolveXySessionLabel } from "@/lib/xy/session-state";

function CellBadge({ cell }: { cell: XYAnalyticsCell }) {
  const phone = cell.phoneVote ?? "—";
  const paper = cell.paperVote ?? "—";

  const tone =
    cell.alignment === "stealth_defector"
      ? "border-rose-500/50 bg-rose-500/15 text-rose-100"
      : cell.alignment === "secret_altruist"
        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100"
        : cell.alignment === "aligned"
          ? "border-slate-700 bg-slate-900 text-slate-300"
          : "border-slate-800 bg-slate-950 text-slate-600";

  const flag =
    cell.alignment === "stealth_defector"
      ? "🚨"
      : cell.alignment === "secret_altruist"
        ? "💚"
        : "";

  return (
    <div
      className={`min-w-20 rounded-lg border px-2 py-1.5 text-center ${tone}`}
      title={
        cell.alignment === "stealth_defector"
          ? "Stealth Defector — გუნდმა Y, ტელეფონით X"
          : cell.alignment === "secret_altruist"
            ? "Secret Altruist — გუნდმა X, ტელეფონით Y"
            : undefined
      }
    >
      <span className="font-[family-name:var(--font-jetbrains)] text-sm font-black">
        {phone} / {paper}
      </span>
      {flag ? <span className="ml-1 text-sm">{flag}</span> : null}
    </div>
  );
}

/** Per-student phone vs team-paper comparison across every round, plus CSV. */
export function XyAnalyticsDashboard() {
  const live = useXyLiveSession();

  const analytics = useMemo(
    () =>
      computeXyAnalytics({
        players: live.players,
        teams: live.teams,
        individualVotes: live.individualVotes,
        teamVotes: live.teamVotes,
        currentRound: live.session?.current_round ?? 1,
      }),
    [
      live.individualVotes,
      live.players,
      live.session?.current_round,
      live.teamVotes,
      live.teams,
    ]
  );

  const rounds = analytics.rounds;
  const rows = analytics.rows;

  const totals = useMemo(
    () => ({
      stealth: rows.reduce((sum, row) => sum + row.stealthDefections, 0),
      altruist: rows.reduce((sum, row) => sum + row.secretAltruism, 0),
    }),
    [rows]
  );

  const handleExport = () => {
    const blob = new Blob([`\uFEFF${analytics.csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xy-analytics-${live.session?.id ?? "session"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
        <p className="font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-slate-300">
          აქტიური XY სესია არ არის
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-teal-400 uppercase">
            XY თამაში
          </p>
          <h1 className="font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-white">
            {resolveXySessionLabel(live.session.label)}
          </h1>
          <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
            ინდივიდუალური და გუნდური არჩევანის თამაში
          </p>
          <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
            🚨 Stealth Defectors: {totals.stealth} · 💚 Secret Altruists:{" "}
            {totals.altruist}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="flex min-h-12 items-center gap-2 rounded-2xl bg-teal-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
        >
          <Download className="size-4" />
          📥 Export Full CSV
        </button>
      </header>

      <p className="mb-3 font-[family-name:var(--font-noto-georgian)] text-xs text-slate-500">
        უჯრა: ტელეფონის ხმა / გუნდის ქაღალდის ხმა
      </p>

      {rows.length === 0 ? (
        <p className="font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
          სტუდენტები ჯერ არ შემოსულან.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/70">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900 px-3 py-3 font-bold">
                  სტუდენტი
                </th>
                <th className="px-3 py-3 font-bold">გუნდი</th>
                {rounds.map((round) => (
                  <th key={round} className="px-3 py-3 text-center font-bold">
                    რაუნდი {round}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-bold">🚨</th>
                <th className="px-3 py-3 text-center font-bold">💚</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr key={row.player.id} className="bg-slate-950/40">
                  <td className="sticky left-0 z-10 bg-slate-950 px-3 py-2 font-[family-name:var(--font-noto-georgian)] font-bold text-slate-100">
                    {resolveXyPlayerName(row.player)}
                  </td>
                  <td className="px-3 py-2 font-[family-name:var(--font-noto-georgian)] text-slate-300">
                    {row.teamNumber === null ? "—" : `#${row.teamNumber} `}
                    {row.teamName}
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.round} className="px-2 py-2">
                      <CellBadge cell={cell} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-[family-name:var(--font-jetbrains)] font-black text-rose-300">
                    {row.stealthDefections || "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-[family-name:var(--font-jetbrains)] font-black text-emerald-300">
                    {row.secretAltruism || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
