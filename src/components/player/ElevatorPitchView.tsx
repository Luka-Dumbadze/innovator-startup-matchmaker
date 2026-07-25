"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ClipboardCopy, Mic2 } from "lucide-react";

import type { IdeaNotes } from "@/types/game";
import { formatPitchSummary } from "@/lib/utils/player-storage";

type ElevatorPitchViewProps = {
  domain: string;
  words: string[];
  notes: IdeaNotes;
  onCopied?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export function ElevatorPitchView({
  domain,
  words,
  notes,
  onCopied,
  onCopyError,
}: ElevatorPitchViewProps) {
  const [copied, setCopied] = useState(false);
  const pitch = formatPitchSummary(notes, domain, words);

  const copyPitch = async () => {
    try {
      await navigator.clipboard.writeText(pitch);
      setCopied(true);
      onCopied?.("Pitch text copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopyError?.("Could not copy pitch text");
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-amber-400/40 bg-gradient-to-b from-amber-500/15 to-slate-950 p-5 shadow-xl"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40">
          <Mic2 className="size-5" />
        </div>
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-amber-300 uppercase">
            1-Minute Elevator Pitch
          </p>
          <h2 className="text-lg font-black text-white">Submitted & locked</h2>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-slate-950/70 p-4 ring-1 ring-slate-700">
        <div>
          <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            Startup
          </p>
          <p className="text-xl font-black text-white">
            {notes.startupName.trim() || "Untitled Startup"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            🌍 გლობალური მისია
          </p>
          <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-amber-100">
            {domain || "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            1-sentence solution
          </p>
          <p className="text-sm leading-relaxed text-slate-200">
            {notes.oneSentenceSolution.trim() || "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            Tools integration
          </p>
          <p className="font-[family-name:var(--font-noto-georgian)] text-sm leading-relaxed text-slate-200">
            {notes.toolsIntegration.trim() || "—"}
          </p>
        </div>
        <p className="font-[family-name:var(--font-noto-georgian)] text-xs text-slate-500">
          🛠️ {words[0] ?? "—"} · ⚡ {words[1] ?? "—"} · 🌀 {words[2] ?? "—"}
        </p>
      </div>

      <button
        type="button"
        onClick={copyPitch}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
      >
        {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
        {copied ? "Copied!" : "Copy Pitch Text"}
      </button>
    </motion.section>
  );
}
