"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import type { Team } from "@/types/game";
import { HOST_TOOL_ROLES, hostTeamTitle } from "@/lib/constants/host-labels";

type TeamHostCardProps = {
  team: Team;
  justJoined?: boolean;
};

export function TeamHostCard({ team, justJoined = false }: TeamHostCardProps) {
  const isFull = team.current_count >= team.max_capacity;
  const progress = Math.min(1, team.current_count / Math.max(1, team.max_capacity));
  const title = hostTeamTitle(team.team_number, team.name);
  const glowShadow = `${team.color}22`;
  const glowBorder = `${team.color}80`;

  return (
    <motion.article
      layout
      initial={{ scale: 1 }}
      animate={
        justJoined
          ? {
              scale: [1, 1.04, 1],
              boxShadow: [
                `0 0 0 0 ${team.color}00`,
                `0 0 36px 4px ${team.color}aa`,
                `0 0 24px 2px ${glowShadow}`,
              ],
            }
          : {
              scale: 1,
              boxShadow: isFull
                ? "0 0 28px 2px rgba(52, 211, 153, 0.35)"
                : `0 0 24px 2px ${glowShadow}`,
            }
      }
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-slate-900/70 p-3 backdrop-blur-md xl:p-4 ${
        isFull
          ? "border-emerald-400/80 ring-2 ring-emerald-400/60"
          : "border-slate-700/60"
      }`}
      style={{
        borderColor: isFull ? undefined : glowBorder,
        borderWidth: 1.5,
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

      <div className="relative mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-black leading-snug tracking-tight text-white xl:text-base">
            {title}
          </p>
        </div>

        {isFull ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/25 px-2.5 py-1 text-xs font-black tracking-wide text-emerald-200 ring-1 ring-emerald-400/70 xl:text-sm">
            FULL ✅
            <CheckCircle2 className="size-3.5" />
          </span>
        ) : (
          <span className="shrink-0 tabular-nums text-lg font-black text-white xl:text-xl">
            {team.current_count}
            <span className="text-slate-500">/{team.max_capacity}</span>
          </span>
        )}
      </div>

      <div className="relative mb-2.5 rounded-xl border border-indigo-500/30 bg-indigo-950/80 px-2.5 py-2">
        <p className="text-[10px] font-bold tracking-[0.1em] text-indigo-200/90 uppercase">
          🌍 გლობალური გამოწვევა
        </p>
        <p className="mt-0.5 font-[family-name:var(--font-noto-georgian)] text-sm font-bold leading-snug text-amber-300 xl:text-base">
          {team.domain || "—"}
        </p>
      </div>

      {/* Dedicated 3-column tool grid — each word isolated so Georgian glyphs never smash */}
      <div className="relative mb-3 grid min-h-0 flex-1 grid-cols-3 gap-1.5">
        {HOST_TOOL_ROLES.map((slot, index) => {
          const word = (team.words[index] ?? "—").trim();
          return (
            <div
              key={`${team.id}-tool-${index}`}
              className="flex min-w-0 flex-col items-center justify-start gap-1 overflow-hidden rounded-xl border border-slate-600/50 bg-slate-950/80 p-1.5 text-center"
              title={`${slot.icon} ${slot.role}: ${word}`}
            >
              <span className="text-sm leading-none" aria-hidden>
                {slot.icon}
              </span>
              <span className="text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                {slot.role}
              </span>
              <span className="w-full break-words font-[family-name:var(--font-noto-georgian)] text-[11px] font-semibold leading-snug text-slate-100 xl:text-xs">
                {word}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative mt-auto">
        <div className="mb-1.5 flex items-center justify-between font-[family-name:var(--font-noto-georgian)] text-xs font-semibold text-slate-400">
          <span>ადგილები: {team.current_count}/{team.max_capacity}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-slate-700/80">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: isFull ? "#34d399" : team.color,
              boxShadow: isFull
                ? "0 0 12px rgba(52, 211, 153, 0.7)"
                : `0 0 10px ${team.color}88`,
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
