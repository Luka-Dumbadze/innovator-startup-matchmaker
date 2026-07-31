"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, UserRound } from "lucide-react";

import { XyErrorBanner } from "@/components/xy/XyErrorBanner";
import { useXyLiveSession } from "@/hooks/useXyLiveSession";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { xyCastIndividualVote, xyJoinPlayer } from "@/lib/supabase/xy-client";
import {
  XY_GENERIC_JOIN_ERROR,
  XY_GENERIC_VOTE_ERROR,
  describeXyError,
} from "@/lib/xy/errors";
import { isXySessionLive } from "@/lib/xy/session-state";
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
  const { refresh: refreshLive } = live;
  const [playerUid, setPlayerUid] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Survives past the name form into the waiting / voting views, so a failed
  // auto-rejoin cannot disappear into the silent spinner.
  const [joinError, setJoinError] = useState<string | null>(null);
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
  const votingOpen = isXySessionLive(session) && session?.voting_open === true;

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
        setJoinError(null);
        await refreshLive();
      } catch (err) {
        console.error("[xy] join failed", err);
        // Leave joinAttemptRef set so the 1.5s poll does not hammer the RPC;
        // the retry button below is the only way back in for this session.
        const message = describeXyError(err, XY_GENERIC_JOIN_ERROR);
        setFormError(message);
        setJoinError(message);
      } finally {
        setJoining(false);
      }
    },
    [refreshLive, playerUid, sessionId]
  );

  const retryJoin = () => {
    if (!fullName || !sessionId || joining) return;
    joinAttemptRef.current = `${sessionId}:${fullName}`;
    setJoinError(null);
    void join(fullName);
  };

  // Re-join automatically once a session appears (or a new one starts).
  useEffect(() => {
    if (!fullName || !sessionId || !playerUid || me) return;
    const attemptKey = `${sessionId}:${fullName}`;
    if (joinAttemptRef.current === attemptKey) return;
    joinAttemptRef.current = attemptKey;
    void join(fullName);
  }, [fullName, join, me, playerUid, sessionId]);

  // A successful roster appearance means the previous join error is stale —
  // compute it rather than clearing state inside an effect.
  const visibleJoinError = me ? null : joinError;

  const handleNameSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = nameDraft.trim();
    if (cleaned.length < 3) {
      setFormError("ჩაწერეთ სახელი და გვარი");
      return;
    }
    setFormError(null);
    setJoinError(null);
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
      await refreshLive();
    } catch (err) {
      console.error("[xy] vote failed", err);
      setVoteError(describeXyError(err, XY_GENERIC_VOTE_ERROR));
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

      {visibleJoinError || live.error ? (
        <div>
          <XyErrorBanner
            messages={[visibleJoinError, live.error]}
            onDismiss={() => setJoinError(null)}
          />
          {visibleJoinError ? (
            <button
              type="button"
              onClick={retryJoin}
              disabled={joining || !sessionId}
              className="mt-2 min-h-12 w-full rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {joining ? (
                <Loader2 className="mx-auto size-4 animate-spin" />
              ) : (
                "ხელახლა ცდა"
              )}
            </button>
          ) : null}
        </div>
      ) : null}

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
              {session
                ? "⏳ ველოდებით რაუნდის დაწყებას..."
                : "⏳ ველოდებით სესიის დაწყებას..."}
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
