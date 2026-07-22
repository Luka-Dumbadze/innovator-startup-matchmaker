"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";

import type { DailySession, Team } from "@/types/game";
import { IdeaNotesCanvas } from "@/components/player/IdeaNotesCanvas";

type AssignedTeamViewProps = {
  session: DailySession;
  team: Team;
  onToast?: (message: string, tone?: "success" | "error") => void;
};

export function AssignedTeamView({ session, team, onToast }: AssignedTeamViewProps) {
  const isFull = team.current_count >= team.max_capacity;

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 py-6 pb-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="text-[11px] font-bold tracking-[0.2em] text-teal-400 uppercase">
          {session.date_label}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">You&apos;re in!</h1>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_0_40px_-12px_rgba(45,212,191,0.35)]"
        style={{ borderTopWidth: 5, borderTopColor: team.color }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-bold text-slate-300 ring-1 ring-slate-700">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                Team {team.team_number}
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white">{team.name}</h2>
            </div>
            <div className="rounded-2xl bg-slate-950/80 px-3 py-2 text-right ring-1 ring-slate-700">
              <p className="flex items-center justify-end gap-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                <Users className="size-3" />
                Seats
              </p>
              <p className="font-mono text-lg font-black tabular-nums text-white">
                {team.current_count}
                <span className="text-slate-500">/{team.max_capacity}</span>
              </p>
              {isFull ? (
                <p className="text-[10px] font-bold text-emerald-400">FULL</p>
              ) : null}
            </div>
          </div>

          <p className="mt-4 mb-2 text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
            Your 4 words
          </p>
          <div className="grid grid-cols-2 gap-2">
            {team.words.map((word, index) => (
              <motion.div
                key={`${word}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index }}
                className="rounded-2xl px-3 py-4 text-center ring-1 ring-white/10"
                style={{
                  background: `linear-gradient(160deg, ${team.color}33, #020617 70%)`,
                }}
              >
                <p className="font-[family-name:var(--font-noto-georgian)] text-lg font-bold leading-snug text-white">
                  {word}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <IdeaNotesCanvas
        key={session.id}
        sessionId={session.id}
        words={team.words}
        onCopied={(msg) => onToast?.(msg, "success")}
        onCopyError={(msg) => onToast?.(msg, "error")}
      />
    </div>
  );
}
