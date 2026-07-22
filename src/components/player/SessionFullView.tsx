"use client";

import { motion } from "framer-motion";
import { DoorClosed, RefreshCw } from "lucide-react";

type SessionFullViewProps = {
  sessionLabel?: string;
  onRetry?: () => void;
  busy?: boolean;
};

export function SessionFullView({
  sessionLabel,
  onRetry,
  busy = false,
}: SessionFullViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/40">
        <DoorClosed className="size-7 text-amber-300" />
      </div>
      <h1 className="text-2xl font-black tracking-tight text-white">All seats are taken</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
        Every team is full (40/40)
        {sessionLabel ? (
          <>
            {" "}
            for <span className="font-semibold text-slate-200">{sessionLabel}</span>
          </>
        ) : null}
        . Find a mentor — they can reset assignments if someone left.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-bold text-white ring-1 ring-slate-600 transition active:scale-[0.98] disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          Try again
        </button>
      ) : null}
    </motion.div>
  );
}
