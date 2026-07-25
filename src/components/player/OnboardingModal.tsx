"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Sparkles, UserRound } from "lucide-react";

import type { PlayerProfile } from "@/types/game";

type OnboardingModalProps = {
  initial?: PlayerProfile | null;
  busy?: boolean;
  onSubmit: (profile: PlayerProfile) => void;
};

export function OnboardingModal({ initial, busy = false, onSubmit }: OnboardingModalProps) {
  const [realName, setRealName] = useState(initial?.realName ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned: PlayerProfile = {
      realName: realName.trim(),
      nickname: nickname.trim(),
    };
    if (!cleaned.realName) {
      setError("Please enter your real name & surname.");
      return;
    }
    if (!cleaned.nickname) {
      setError("Please choose a nickname for your team.");
      return;
    }
    if (cleaned.nickname.length > 24) {
      setError("Nickname must be 24 characters or fewer.");
      return;
    }
    setError(null);
    onSubmit(cleaned);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-8"
    >
      <div className="rounded-3xl border border-slate-700 bg-slate-900/90 p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30">
            <UserRound className="size-5" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-teal-400 uppercase">
              Student onboarding
            </p>
            <h1 className="text-xl font-black text-white">Who are you?</h1>
          </div>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-slate-400">
          Mentors see your real name privately. Your nickname is what teammates see in the idea hub.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Real name & surname
            </span>
            <input
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="e.g. Luka Dumbadze"
              autoComplete="name"
              required
              disabled={busy}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-base text-white outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Nickname
            </span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. TechWiz"
              maxLength={24}
              required
              disabled={busy}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-base text-white outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
            />
          </label>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-4 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.99] hover:bg-teal-400 disabled:opacity-60"
          >
            <Sparkles className="size-4" />
            {busy ? "Joining…" : "Join session"}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
