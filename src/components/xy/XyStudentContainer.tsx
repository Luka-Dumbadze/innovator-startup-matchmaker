"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, UserRound } from "lucide-react";

import { useXyLiveSession } from "@/hooks/useXyLiveSession";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { xyCastIndividualVote, xyJoinPlayer } from "@/lib/supabase/xy-client";
import {
  XY_NAME_MAX,
  getOrCreateXyPlayerUid,
  getXyPlayerName,
  getXyStoredVote,
  saveXyPlayerName,
  saveXyStoredVote,
  type XyStoredVote,
} from "@/lib/utils/xy-storage";
import type { XYVote } from "@/types/xy";

export function XyStudentContainer() {
  const live = useXyLiveSession();
  const [playerUid, setPlayerUid] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [cachedVote, setCachedVote] = useState<XyStoredVote | null>(null);

  const joinAttemptRef = useRef<string | null>(null);

  // Identity lives in localStorage, so it can only be read after hydration.
  useEffect(() => {
    void (async () => {
      setPlayerUid(getOrCreateXyPlayerUid());
      setFullName(getXyPlayerName());
      setCachedVote(getXyStoredVote());
    })();
  }, []);

  const session = live.session;
  const sessionId = session?.id ?? "";
  const round = session?.current_round ?? 1;
  const votingOpen = session?.voting_open === true;

  const me = useMemo(
    () => (playerUid ? live.players.find((p) => p.player_uid === playerUid) ?? null : null),
    [live.players, playerUid]
  );

  const serverVote = useMemo(() => {
    if (!me) return null;
    return (
      live.individualVotes.find(
        (v) => v.player_id === me.id && v.round_number === round
      )?.vote ?? null
    );
  }, [live.individualVotes, me, round]);

  // Keeps "vote received" on screen until the next snapshot confirms the tap.
  const optimisticVote =
    cachedVote && cachedVote.sessionId === sessionId && cachedVote.round === round
      ? cachedVote.vote
      : null;

  const submittedVote = serverVote ?? optimisticVote;

  const join = useCallback(
    async (name: string) => {
      if (!sessionId || !playerUid) return;
      setJoining(true);
      try {
        await xyJoinPlayer(createBrowserSupabaseClient(), {
          sessionId,
          playerUid,
          fullName: name,
        });
        setFormError(null);
        await live.refresh();
      } catch (err) {
        console.error("[xy] join failed", err);
        joinAttemptRef.current = null;
        setFormError(err instanceof Error ? err.message : "დაერთება ვერ მოხერხდა");
      } finally {
        setJoining(false);
      }
    },
    [live, playerUid, sessionId]
  );

  // Re-join automatically once a session appears (or a new one starts).
  useEffect(() => {
    if (!fullName || !sessionId || !playerUid || me) return;
    const attemptKey = `${sessionId}:${fullName}`;
    if (joinAttemptRef.current === attemptKey) return;
    joinAttemptRef.current = attemptKey;
    void join(fullName);
  }, [fullName, join, me, playerUid, sessionId]);

  const handleNameSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = nameDraft.trim();
    if (cleaned.length < 3) {
      setFormError("ჩაწერეთ სახელი და გვარი");
      return;
    }
    setFormError(null);
    saveXyPlayerName(cleaned);
    setFullName(cleaned);
  };

  const handleVote = async (vote: XYVote) => {
    if (!sessionId || !playerUid || voting) return;
    setVoting(true);
    setVoteError(null);
    try {
      await xyCastIndividualVote(createBrowserSupabaseClient(), {
        sessionId,
        playerUid,
        vote,
      });
      const stored = { sessionId, round, vote };
      saveXyStoredVote(stored);
      setCachedVote(stored);
      await live.refresh();
    } catch (err) {
      console.error("[xy] vote failed", err);
      setVoteError(err instanceof Error ? err.message : "ხმა ვერ გაიგზავნა");
    } finally {
      setVoting(false);
    }
  };

  if (!playerUid || (live.loading && !session)) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!fullName) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center px-4 py-8"
      >
        <div className="rounded-3xl border border-slate-700 bg-slate-900/90 p-5 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30">
              <UserRound className="size-5" />
            </div>
            <h1 className="font-[family-name:var(--font-noto-georgian)] text-xl font-black text-white">
              სახელი და გვარი
            </h1>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-4">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="ჩაწერეთ სახელი და გვარი..."
              autoComplete="name"
              maxLength={XY_NAME_MAX}
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3.5 font-[family-name:var(--font-noto-georgian)] text-base text-white outline-none placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            />

            {formError ? (
              <p className="font-[family-name:var(--font-noto-georgian)] text-sm text-rose-300">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              className="min-h-14 w-full rounded-2xl bg-teal-500 px-4 py-3 font-[family-name:var(--font-noto-georgian)] text-base font-black text-slate-950 transition active:scale-[0.99] hover:bg-teal-400"
            >
              შესვლა
            </button>
          </form>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[85vh] w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <p className="text-center font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
        {fullName}
      </p>

      <AnimatePresence mode="wait">
        {!votingOpen ? (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl border border-slate-700 bg-slate-900/80 px-5 py-12 text-center"
          >
            <p className="font-[family-name:var(--font-noto-georgian)] text-xl font-bold text-slate-200">
              ⏳ ველოდებით რაუნდის დაწყებას...
            </p>
            {joining ? (
              <Loader2 className="mx-auto mt-4 size-5 animate-spin text-slate-500" />
            ) : null}
          </motion.div>
        ) : submittedVote ? (
          <motion.div
            key="locked"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="rounded-3xl border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-16 text-center"
          >
            <p className="font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-emerald-200">
              ✓ ხმა მიღებულია ({submittedVote})
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="vote"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-5"
          >
            <button
              type="button"
              onClick={() => void handleVote("X")}
              disabled={voting}
              className="flex min-h-[9rem] w-full items-center justify-center rounded-3xl bg-rose-500 text-7xl font-black text-white shadow-[0_0_50px_-12px_rgba(244,63,94,0.7)] transition active:scale-[0.98] hover:bg-rose-400 disabled:opacity-60"
            >
              X
            </button>
            <button
              type="button"
              onClick={() => void handleVote("Y")}
              disabled={voting}
              className="flex min-h-[9rem] w-full items-center justify-center rounded-3xl bg-emerald-500 text-7xl font-black text-white shadow-[0_0_50px_-12px_rgba(16,185,129,0.7)] transition active:scale-[0.98] hover:bg-emerald-400 disabled:opacity-60"
            >
              Y
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {voteError ? (
        <p className="text-center font-[family-name:var(--font-noto-georgian)] text-sm text-rose-300">
          {voteError}
        </p>
      ) : null}
    </div>
  );
}
