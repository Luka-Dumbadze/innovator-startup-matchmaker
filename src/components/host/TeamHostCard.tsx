"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import type { Team } from "@/types/game";
import { TOOL_SLOT_META } from "@/lib/constants/preset-words";

type TeamHostCardProps = {
  team: Team;
  justJoined?: boolean;
};

export function TeamHostCard({ team, justJoined = false }: TeamHostCardProps) {
  const isFull = team.current_count >= team.max_capacity;
  const progress = Math.min(1, team.current_count / Math.max(1, team.max_capacity));

  return (
    <motion.article
      layout
      initial={{ scale: 1, boxShadow: "0 0 0 0 transparent" }}
      animate={
        justJoined
          ? {
              scale: [1, 1.04, 1],
              boxShadow: [
                `0 0 0 0 ${team.color}00`,
                `0 0 36px 4px ${team.color}aa`,
                `0 0 0 0 ${team.color}00`,
              ],
            }
          : { scale: 1, boxShadow: "0 0 0 0 transparent" }
      }
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-slate-900/85 p-4 xl:p-5 ${
        isFull
          ? "border-emerald-400/80 ring-2 ring-emerald-400/70"
          : "border-slate-700/90"
      }`}
      style={{
        borderTopColor: isFull ? undefined : team.color,
        borderTopWidth: isFull ? undefined : 3,
      }}
    >
      {justJoined ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1 }}
          style={{
            background: `radial-gradient(circle at 30% 20%, ${team.color}55, transparent 55%)`,
          }}
        />
      ) : null}

      <div className="relative mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="size-3.5 shrink-0 rounded-full ring-2 ring-white/20"
              style={{ backgroundColor: team.color }}
            />
            <p className="truncate text-lg font-bold tracking-tight text-white xl:text-xl">
              {team.name}
            </p>
          </div>
          <p className="mt-0.5 text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">
            Team {team.team_number}
          </p>
        </div>

        {isFull ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-black tracking-wide text-emerald-300 ring-1 ring-emerald-400/60 xl:text-sm">
            FULL
            <CheckCircle2 className="size-3.5" />
          </span>
        ) : (
          <span className="tabular-nums text-lg font-black text-white xl:text-xl">
            {team.current_count}
            <span className="text-slate-500">/{team.max_capacity}</span>
          </span>
        )}
      </div>

      <div className="relative mb-3 rounded-xl bg-amber-500/20 px-3 py-2.5 ring-1 ring-amber-400/50">
        <p className="text-[10px] font-bold tracking-[0.12em] text-amber-200/90 uppercase">
          🌍 გლობალური გამოწვევა
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-noto-georgian)] text-sm font-black leading-snug text-amber-50 xl:text-base">
          {team.domain || "—"}
        </p>
      </div>

      <ul className="relative mb-4 grid flex-1 grid-cols-3 gap-1.5">
        {TOOL_SLOT_META.map((slot, index) => {
          const word = team.words[index] ?? "—";
          return (
            <li
              key={slot.label}
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-950/70 px-1.5 py-2 text-center ring-1 ring-slate-700/80"
              title={`${slot.label}: ${word}`}
            >
              <span className="text-[10px] leading-none" aria-hidden>
                {slot.icon}
              </span>
              <span className="truncate font-[family-name:var(--font-noto-georgian)] text-xs font-semibold text-slate-100 xl:text-sm">
                {word}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="relative">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Slots</span>
          <span className="tabular-nums">
            {team.current_count} / {team.max_capacity}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: isFull ? "#34d399" : team.color,
            }}
            initial={{ width: `${progress * 100}%`, opacity: 1 }}
            animate={{ width: `${progress * 100}%`, opacity: 1 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>
    </motion.article>
  );
}
