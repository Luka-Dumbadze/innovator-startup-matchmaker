"use client";

import { motion } from "framer-motion";

import {
  EXPIRY_INSTRUCTIONS,
  type TimerMode,
} from "@/lib/timer/session-timer";

type TimerExpiredModalProps = {
  open: boolean;
  mode: TimerMode;
  onDismiss: () => void;
};

export function TimerExpiredModal({ open, mode, onDismiss }: TimerExpiredModalProps) {
  if (!open) return null;

  const instruction = EXPIRY_INSTRUCTIONS[mode];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-rose-950/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 1.1, repeat: Infinity }}
        aria-hidden
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="timer-expired-title"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: [1, 1.02, 1] }}
        transition={{
          opacity: { duration: 0.25 },
          scale: { duration: 0.9, repeat: Infinity },
        }}
        className="relative w-full max-w-sm rounded-3xl border border-rose-400/50 bg-slate-950 px-6 py-8 text-center shadow-2xl ring-2 ring-rose-500/60"
      >
        <p className="text-4xl" aria-hidden>
          ⏰
        </p>
        <h2
          id="timer-expired-title"
          className="mt-3 font-[family-name:var(--font-noto-georgian)] text-xl font-black leading-snug text-white"
        >
          დრო ამოიწურა!
        </h2>
        <p className="mt-3 font-[family-name:var(--font-noto-georgian)] text-sm leading-relaxed text-rose-100">
          {instruction}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 min-h-12 w-full rounded-2xl bg-rose-500 px-4 py-3 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-white transition active:scale-[0.98] hover:bg-rose-400"
        >
          გავიგე
        </button>
      </motion.div>
    </div>
  );
}
