"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ClipboardCopy, Lightbulb, Lock, Sparkles } from "lucide-react";

import type { IdeaNotes } from "@/types/game";
import {
  IDEA_FIELD_MAX,
  clampIdeaField,
  formatPitchSummary,
  getIdeaNotes,
  saveIdeaNotes,
} from "@/lib/utils/player-storage";

type IdeaNotesCanvasProps = {
  sessionId: string;
  domain: string;
  words: string[];
  locked?: boolean;
  /** When set (e.g. “Use as Team Foundation”), replaces the local draft. */
  externalNotes?: IdeaNotes | null;
  onNotesChange?: (notes: IdeaNotes) => void;
  onCopied?: (message: string) => void;
  onCopyError?: (message: string) => void;
};

export function IdeaNotesCanvas({
  sessionId,
  domain,
  words,
  locked = false,
  externalNotes = null,
  onNotesChange,
  onCopied,
  onCopyError,
}: IdeaNotesCanvasProps) {
  const [notes, setNotes] = useState<IdeaNotes>(() => getIdeaNotes(sessionId));
  const [copied, setCopied] = useState(false);
  const [syncedExternal, setSyncedExternal] = useState<IdeaNotes | null>(null);
  const onNotesChangeRef = useRef(onNotesChange);

  // Adjust local draft when parent pushes a foundation (render-time, not effect).
  if (externalNotes !== null && externalNotes !== syncedExternal) {
    setSyncedExternal(externalNotes);
    setNotes(externalNotes);
  }

  useEffect(() => {
    onNotesChangeRef.current = onNotesChange;
  }, [onNotesChange]);

  useEffect(() => {
    if (locked) return;
    saveIdeaNotes(sessionId, notes);
    onNotesChangeRef.current?.(notes);
  }, [sessionId, notes, locked]);

  const pitchPreview = useMemo(
    () => formatPitchSummary(notes, domain, words),
    [notes, domain, words]
  );

  const update = <K extends keyof IdeaNotes>(key: K, value: IdeaNotes[K]) => {
    if (locked) return;
    setNotes((prev) => ({ ...prev, [key]: clampIdeaField(value) }));
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
    "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.35 }}
      className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          {locked ? <Lock className="size-4" /> : <Lightbulb className="size-4" />}
        </div>
        <div>
          <h2 className="text-base font-bold text-white">
            {locked ? "Locked pitch draft" : "Idea micro-form"}
          </h2>
          <p className="text-xs text-slate-400">
            {locked
              ? "Inputs locked after time expired"
              : "Autosaves locally · max 140 chars each"}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 ring-1 ring-amber-400/30">
        <p className="text-[10px] font-bold tracking-wide text-amber-200/80 uppercase">
          🎯 სამიზნე სფერო
        </p>
        <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-amber-50">
          {domain || "—"}
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <span>🏷️ Startup Name / Title</span>
            <span className="tabular-nums text-[10px] normal-case text-slate-500">
              {notes.startupName.length}/{IDEA_FIELD_MAX}
            </span>
          </span>
          <input
            type="text"
            value={notes.startupName}
            onChange={(e) => update("startupName", e.target.value)}
            placeholder="e.g. SolarLink"
            maxLength={IDEA_FIELD_MAX}
            disabled={locked}
            className={fieldClass}
            autoComplete="off"
          />
        </label>

        <label className="block">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <span>🎯 1-Sentence Solution</span>
            <span className="tabular-nums text-[10px] normal-case text-slate-500">
              {notes.oneSentenceSolution.length}/{IDEA_FIELD_MAX}
            </span>
          </span>
          <textarea
            value={notes.oneSentenceSolution}
            onChange={(e) => update("oneSentenceSolution", e.target.value)}
            placeholder="How you address the global challenge in one line…"
            maxLength={IDEA_FIELD_MAX}
            rows={3}
            disabled={locked}
            className={`${fieldClass} resize-y`}
          />
        </label>

        <label className="block">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <span>🔑 3 Tools Integration</span>
            <span className="tabular-nums text-[10px] normal-case text-slate-500">
              {notes.toolsIntegration.length}/{IDEA_FIELD_MAX}
            </span>
          </span>
          <p className="mt-1 mb-1.5 font-[family-name:var(--font-noto-georgian)] text-xs text-teal-300/90">
            {words.join(" · ")}
          </p>
          <textarea
            value={notes.toolsIntegration}
            onChange={(e) => update("toolsIntegration", e.target.value)}
            placeholder="How the 3 components combine into your product…"
            maxLength={IDEA_FIELD_MAX}
            rows={3}
            disabled={locked}
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
