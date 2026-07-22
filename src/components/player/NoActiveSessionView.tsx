"use client";

import { motion } from "framer-motion";
import { Radio, RefreshCw } from "lucide-react";

type NoActiveSessionViewProps = {
  onRetry?: () => void;
  busy?: boolean;
};

export function NoActiveSessionView({ onRetry, busy = false }: NoActiveSessionViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-slate-900 ring-1 ring-slate-700">
        <Radio className="size-7 text-teal-400" />
      </div>
      <h1 className="text-2xl font-black tracking-tight text-white">Waiting for mentors…</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
        No daily session is active yet. Hang tight — once mentors start the morning, scan again or
        tap refresh.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-teal-500 px-5 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.98] disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          Check again
        </button>
      ) : null}
    </motion.div>
  );
}
