"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, ClipboardCopy, Lightbulb, Sparkles } from "lucide-react";

import type { Team } from "@/types/game";
import {
  formatPitchSummary,
  getIdeaNotes,
  saveIdeaNotes,
  type IdeaNotes,
} from "@/lib/utils/player-storage";

type IdeaNotesCanvasProps = {
  sessionId: string;
  words: Team["words"];
  onCopied?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export function IdeaNotesCanvas({
  sessionId,
  words,
  onCopied,
  onCopyError,
}: IdeaNotesCanvasProps) {
  const [notes, setNotes] = useState<IdeaNotes>(() => getIdeaNotes(sessionId));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    saveIdeaNotes(sessionId, notes);
  }, [sessionId, notes]);

  const pitchPreview = useMemo(
    () => formatPitchSummary(notes, words),
    [notes, words]
  );

  const update = <K extends keyof IdeaNotes>(key: K, value: IdeaNotes[K]) => {
    setNotes((prev) => ({ ...prev, [key]: value }));
  };

  const copyPitch = async () => {
    try {
      await navigator.clipboard.writeText(pitchPreview);
      setCopied(true);
      onCopied?.("Pitch summary copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopyError?.("Could not copy — select and copy manually");
    }
  };

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.35 }}
      className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          <Lightbulb className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Idea scratchpad</h2>
          <p className="text-xs text-slate-400">Autosaves on this phone · 12-min brainstorm</p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Startup name
          </span>
          <input
            type="text"
            value={notes.startupName}
            onChange={(e) => update("startupName", e.target.value)}
            placeholder="e.g. SolarLink"
            className={fieldClass}
            autoComplete="off"
            enterKeyHint="next"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Problem solved
          </span>
          <textarea
            value={notes.problemSolved}
            onChange={(e) => update("problemSolved", e.target.value)}
            placeholder="Who hurts, and why now?"
            rows={3}
            className={`${fieldClass} resize-y`}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            How 4 words are used
          </span>
          <p className="mt-1 mb-1.5 font-[family-name:var(--font-noto-georgian)] text-xs text-teal-300/90">
            {words.join(" · ")}
          </p>
          <textarea
            value={notes.howWordsUsed}
            onChange={(e) => update("howWordsUsed", e.target.value)}
            placeholder="Connect each word to your product idea…"
            rows={4}
            className={`${fieldClass} resize-y font-[family-name:var(--font-noto-georgian)]`}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={copyPitch}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-4 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.99] hover:bg-teal-400"
      >
        {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
        {copied ? "Copied!" : "📋 Copy Pitch Summary"}
        <Sparkles className="size-3.5 opacity-70" />
      </button>
    </motion.section>
  );
}
