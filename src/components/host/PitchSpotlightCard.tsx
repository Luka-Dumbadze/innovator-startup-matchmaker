"use client";

import { motion } from "framer-motion";
import { Mic2, ThumbsDown, ThumbsUp } from "lucide-react";

import { hostTeamTitle } from "@/lib/constants/host-labels";
import { TOOL_SLOT_META } from "@/lib/constants/preset-words";
import { formatTimerClock } from "@/lib/timer/session-timer";
import type { Team } from "@/types/game";

export type PitchSpotlightData = {
  team: Team;
  pitcherNickname: string;
  startupName: string;
  solution: string;
  toolsIntegration: string;
  likesCount: number;
  dislikesCount: number;
  /** Pitch countdown seconds (when pitching). */
  pitchSecondsRemaining: number;
  /** Voting countdown seconds (when voting window open). */
  votingSecondsRemaining: number;
  votingOpen: boolean;
  pitchLive: boolean;
};

type PitchSpotlightCardProps = {
  data: PitchSpotlightData;
};

export function PitchSpotlightCard({ data }: PitchSpotlightCardProps) {
  const {
    team,
    pitcherNickname,
    startupName,
    solution,
    toolsIntegration,
    likesCount,
    dislikesCount,
    pitchSecondsRemaining,
    votingSecondsRemaining,
    votingOpen,
    pitchLive,
  } = data;

  const displaySeconds = votingOpen ? votingSecondsRemaining : pitchSecondsRemaining;
  const timerLabel = votingOpen ? "🗳️ ხმის მიცემა" : "🎤 პიჩის ტაიმერი";
  const timerUrgent = !votingOpen && pitchLive && pitchSecondsRemaining > 0 && pitchSecondsRemaining <= 10;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border-2 border-amber-400/50 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_0_80px_-12px_rgba(251,191,36,0.55)]"
      style={{ borderTopWidth: 8, borderTopColor: team.color }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-slate-950/80 px-6 py-4 xl:px-10 xl:py-5">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className="size-5 shrink-0 rounded-full ring-4 ring-white/25 xl:size-6"
            style={{ backgroundColor: team.color }}
          />
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-amber-300 uppercase xl:text-sm">
              <Mic2 className="size-4" />
              Live Pitch Spotlight
            </p>
            <h2 className="font-[family-name:var(--font-noto-georgian)] text-2xl font-black leading-tight text-white xl:text-4xl">
              {hostTeamTitle(team.team_number, team.name)}
            </h2>
          </div>
        </div>

        <div
          className={`rounded-2xl px-6 py-3 text-center ring-2 ${
            votingOpen
              ? "bg-sky-500/20 text-sky-200 ring-sky-400/50"
              : timerUrgent
                ? "bg-rose-500/25 text-rose-200 ring-rose-400/60"
                : pitchLive
                  ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/40"
                  : "bg-slate-800 text-white ring-slate-600"
          }`}
        >
          <p className="font-[family-name:var(--font-noto-georgian)] text-xs font-bold tracking-wide opacity-90">
            {timerLabel}
          </p>
          <motion.p
            className="font-mono text-5xl font-black tabular-nums tracking-tight xl:text-7xl"
            animate={timerUrgent ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={timerUrgent ? { duration: 0.55, repeat: Infinity } : undefined}
          >
            {formatTimerClock(displaySeconds)}
          </motion.p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5 xl:px-10 xl:py-8">
        <p className="mb-6 rounded-2xl bg-emerald-500/15 px-5 py-4 font-[family-name:var(--font-noto-georgian)] text-xl font-black text-emerald-100 ring-1 ring-emerald-400/40 xl:text-2xl">
          🎤 პრეზენტატორი: {pitcherNickname}
        </p>

        <div className="mb-6 rounded-2xl border border-indigo-500/40 bg-indigo-950/80 px-5 py-4">
          <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-indigo-200 xl:text-base">
            🌍 გლობალური გამოწვევა:{" "}
            <span className="text-amber-200">{team.domain || "—"}</span>
          </p>
        </div>

        <div className="mb-8">
          <p className="mb-3 font-[family-name:var(--font-noto-georgian)] text-base font-black text-amber-200 xl:text-lg">
            🔑 ამ გუნდის 3 ინსტრუმენტი
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {TOOL_SLOT_META.map((slot, i) => (
              <div
                key={slot.label}
                className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-4 text-center ring-1 ring-white/5"
              >
                <p className="text-2xl" aria-hidden>
                  {slot.icon}
                </p>
                <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-slate-400">
                  {slot.label}:
                </p>
                <p className="mt-2 font-[family-name:var(--font-noto-georgian)] text-lg font-black leading-snug text-white xl:text-xl">
                  {team.words[i] ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 space-y-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-slate-500 uppercase">
              Startup Title
            </p>
            <p className="mt-1 text-3xl font-black leading-tight text-white xl:text-5xl">
              {startupName}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-slate-500 uppercase">
              1-Sentence Solution
            </p>
            <p className="mt-2 font-[family-name:var(--font-noto-georgian)] text-xl leading-relaxed font-bold text-slate-100 xl:text-3xl">
              {solution}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-slate-500 uppercase">
              Tools Integration
            </p>
            <p className="mt-2 font-[family-name:var(--font-noto-georgian)] text-lg leading-relaxed text-slate-200 xl:text-2xl">
              {toolsIntegration}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 rounded-2xl bg-slate-950/90 px-6 py-5 ring-1 ring-slate-700">
          <div className="flex items-center gap-3 text-emerald-300">
            <ThumbsUp className="size-8 xl:size-10" />
            <span className="font-mono text-4xl font-black tabular-nums xl:text-5xl">
              {likesCount}
            </span>
            <span className="font-[family-name:var(--font-noto-georgian)] text-sm font-bold xl:text-base">
              👍 Likes
            </span>
          </div>
          <div className="h-12 w-px bg-slate-700" />
          <div className="flex items-center gap-3 text-rose-300">
            <ThumbsDown className="size-8 xl:size-10" />
            <span className="font-mono text-4xl font-black tabular-nums xl:text-5xl">
              {dislikesCount}
            </span>
            <span className="font-[family-name:var(--font-noto-georgian)] text-sm font-bold xl:text-base">
              👎 Dislikes
            </span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
