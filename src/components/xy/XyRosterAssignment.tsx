"use client";

import { useState, type FormEvent } from "react";
import { Check, Users } from "lucide-react";

import { resolveXyPlayerName } from "@/lib/xy/roster";
import type { XYPlayer, XYTeam } from "@/types/xy";

type XyRosterAssignmentProps = {
  teams: XYTeam[];
  players: XYPlayer[];
  pendingPlayerId: string | null;
  onAssign: (playerId: string, teamId: string | null) => void;
  onRenameTeam: (teamId: string, name: string) => void;
  onAutoBalance: () => void;
  autoBalancePending: boolean;
};

function TeamNameInput({
  team,
  onRename,
}: {
  team: XYTeam;
  onRename: (teamId: string, name: string) => void;
}) {
  const [draft, setDraft] = useState(team.name);
  const dirty = draft.trim() !== team.name && draft.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    onRename(team.id, draft.trim());
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: team.color }}
      />
      <span className="w-6 font-[family-name:var(--font-jetbrains)] text-xs text-slate-500">
        #{team.team_number}
      </span>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={40}
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-[family-name:var(--font-noto-georgian)] text-sm text-white outline-none focus:border-teal-500"
      />
      <button
        type="submit"
        disabled={!dirty}
        aria-label={`Save name for team ${team.team_number}`}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-teal-300 transition hover:bg-slate-800 disabled:opacity-30"
      >
        <Check className="size-4" />
      </button>
    </form>
  );
}

/** Mentor roster: name the 8 teams and place each joined student in one. */
export function XyRosterAssignment({
  teams,
  players,
  pendingPlayerId,
  onAssign,
  onRenameTeam,
  onAutoBalance,
  autoBalancePending,
}: XyRosterAssignmentProps) {
  const unassignedCount = players.filter((p) => !p.team_id).length;

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-[family-name:var(--font-noto-georgian)] text-base font-black text-white">
          <Users className="size-4 text-teal-300" />
          სტუდენტების სია & გუნდების დანაწილება
        </h2>
        <button
          type="button"
          onClick={onAutoBalance}
          disabled={autoBalancePending || unassignedCount === 0 || teams.length === 0}
          className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-2 font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-teal-200 transition hover:bg-teal-500/20 disabled:opacity-40"
        >
          ⚖️ ავტომატური განაწილება ({unassignedCount})
        </button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {teams.map((team) => (
          <TeamNameInput
            key={`${team.id}:${team.name}`}
            team={team}
            onRename={onRenameTeam}
          />
        ))}
      </div>

      {players.length === 0 ? (
        <p className="font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
          სტუდენტები ჯერ არ შემოსულან — გაუზიარეთ ბმული /xy
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">სტუდენტი</th>
                <th className="px-3 py-2 font-semibold">გუნდი</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {players.map((player) => (
                <tr key={player.id} className="bg-slate-950/40">
                  <td className="px-3 py-2 font-[family-name:var(--font-noto-georgian)] text-slate-100">
                    {resolveXyPlayerName(player)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={player.team_id ?? ""}
                      disabled={pendingPlayerId === player.id}
                      onChange={(e) => onAssign(player.id, e.target.value || null)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-[family-name:var(--font-noto-georgian)] text-sm text-white outline-none focus:border-teal-500 disabled:opacity-40"
                    >
                      <option value="">— გუნდის გარეშე</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          #{team.team_number} {team.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
