"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Zap } from "lucide-react";

import {
  createAndActivateSession,
  type TeamDraftInput,
} from "@/lib/actions/admin-actions";
import {
  generateRandomPresets,
  TEAM_COLOR_PRESETS,
  type TeamPresetConfig,
} from "@/lib/constants/preset-words";
import { useToast } from "@/components/admin/ToastProvider";

function toDraft(presets: TeamPresetConfig[]): TeamDraftInput[] {
  return presets.map((p) => ({
    teamNumber: p.teamNumber,
    name: p.name,
    color: p.color,
    domain: p.domain,
    words: [...p.words],
  }));
}

function defaultTeams(): TeamDraftInput[] {
  return TEAM_COLOR_PRESETS.map((preset, index) => ({
    teamNumber: index + 1,
    name: preset.label,
    color: preset.hex,
    domain: "",
    words: ["", "", ""],
  }));
}

export function CreateSessionForm() {
  const router = useRouter();
  const { push } = useToast();
  const [dateLabel, setDateLabel] = useState("");
  const [teams, setTeams] = useState<TeamDraftInput[]>(defaultTeams);
  const [pending, startTransition] = useTransition();

  const autoFill = () => {
    const presets = generateRandomPresets();
    setTeams(toDraft(presets));
    push("Filled 8 teams with domains + keywords", "success");
  };

  const updateTeam = (index: number, patch: Partial<TeamDraftInput>) => {
    setTeams((prev) =>
      prev.map((team, i) => (i === index ? { ...team, ...patch } : team))
    );
  };

  const updateWord = (teamIndex: number, wordIndex: number, value: string) => {
    setTeams((prev) =>
      prev.map((team, i) => {
        if (i !== teamIndex) return team;
        const words = [...team.words];
        words[wordIndex] = value;
        return { ...team, words };
      })
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createAndActivateSession(dateLabel, teams);
      if (!result.ok) {
        push(result.error, "error");
        return;
      }
      push(`Session “${dateLabel.trim()}” is live`, "success");
      setDateLabel("");
      setTeams(defaultTeams());
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Session label
          </span>
          <input
            type="text"
            required
            value={dateLabel}
            onChange={(e) => setDateLabel(e.target.value)}
            placeholder="Day 2 - Summer School"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-teal-600/30 transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2"
          />
        </label>
        <button
          type="button"
          onClick={autoFill}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400"
        >
          <Zap className="size-4" />
          Auto-Fill Random Words
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {teams.map((team, teamIndex) => (
          <div
            key={team.teamNumber}
            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5"
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="size-3.5 shrink-0 rounded-full ring-2 ring-white"
                style={{ backgroundColor: team.color }}
                title={team.color}
              />
              <input
                type="text"
                value={team.name}
                onChange={(e) => updateTeam(teamIndex, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-white/80 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-slate-300"
                aria-label={`Team ${team.teamNumber} name`}
              />
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                T{team.teamNumber}
              </span>
            </div>

            <label className="mb-2 block">
              <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase">
                🎯 Domain
              </span>
              <input
                type="text"
                value={team.domain}
                onChange={(e) => updateTeam(teamIndex, { domain: e.target.value })}
                placeholder="სამიზნე სფერო"
                className="w-full rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40"
                required
              />
            </label>

            <div className="grid gap-1.5">
              {team.words.map((word, wordIndex) => (
                <input
                  key={wordIndex}
                  type="text"
                  value={word}
                  onChange={(e) => updateWord(teamIndex, wordIndex, e.target.value)}
                  placeholder={`Keyword ${wordIndex + 1}`}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                  required
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Sparkles className="size-3.5 text-amber-500" />
          Creating activates this session and deactivates any previous one.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Creating…" : "Create & Activate Session"}
        </button>
      </div>
    </form>
  );
}
