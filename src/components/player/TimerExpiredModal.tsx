"use client";

import { motion } from "framer-motion";

type TimerExpiredModalProps = {
  open: boolean;
  onDismiss: () => void;
};

export function TimerExpiredModal({ open, onDismiss }: TimerExpiredModalProps) {
  if (!open) return null;

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
        animate={{ opacity: 1, scale: [1, 1.03, 1] }}
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
          className="mt-3 font-[family-name:var(--font-noto-georgian)] text-2xl font-black leading-snug text-white"
        >
          დრო ამოიწურა! მოემზადეთ პიჩისთვის!
        </h2>
        <p className="mt-2 text-sm text-rose-200/90">Time&apos;s up — get ready to pitch.</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 min-h-12 w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-rose-400"
        >
          გავიგე / Dismiss
        </button>
      </motion.div>
    </div>
  );
}
