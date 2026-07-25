"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

import {
  assignPlayerAtomically,
  createBrowserSupabaseClient,
} from "@/lib/supabase/client";
import {
  getOrCreatePlayerUid,
  getPlayerProfile,
  getSavedAssignment,
  saveAssignment,
  savePlayerProfile,
} from "@/lib/utils/player-storage";
import type { DailySession, PlayerProfile, Team } from "@/types/game";
import { AssignedTeamView } from "@/components/player/AssignedTeamView";
import { NoActiveSessionView } from "@/components/player/NoActiveSessionView";
import { OnboardingModal } from "@/components/player/OnboardingModal";
import { SessionFullView } from "@/components/player/SessionFullView";

type PlayerPhase =
  | { status: "loading" }
  | { status: "no_session" }
  | { status: "needs_onboarding"; session: DailySession; initialProfile: PlayerProfile | null }
  | { status: "session_full"; session: DailySession }
  | { status: "assigned"; session: DailySession; team: Team; profile: PlayerProfile }
  | { status: "error"; message: string };

type ToastItem = {
  id: string;
  message: string;
  tone: "success" | "error";
};

function isSessionFullError(message: string): boolean {
  return /SESSION_FULL/i.test(message);
}

export function PlayerAssignmentSkeleton() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-4 px-4">
      <div className="mx-auto h-4 w-40 animate-pulse rounded-full bg-slate-800" />
      <div className="h-8 w-48 animate-pulse self-center rounded-xl bg-slate-800" />
      <div className="mt-2 h-56 animate-pulse rounded-3xl bg-slate-900 ring-1 ring-slate-800" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-900" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-900" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-900" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-900" />
      </div>
      <p className="mt-4 text-center text-sm font-medium text-slate-500">
        Finding your team…
      </p>
    </div>
  );
}

function PlayerToastStack({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-2xl border px-3.5 py-3 shadow-lg backdrop-blur ${
              toast.tone === "success"
                ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-50"
                : "border-rose-500/30 bg-rose-950/90 text-rose-50"
            }`}
          >
            {toast.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            <button
              type="button"
              className="rounded-md p-0.5 opacity-70"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

async function fetchActiveSession(): Promise<DailySession | null> {
  const supabase = createBrowserSupabaseClient();
  const { data: session, error: sessionError } = await supabase
    .from("daily_sessions")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  return session;
}

async function assignWithProfile(
  session: DailySession,
  profile: PlayerProfile
): Promise<PlayerPhase> {
  const playerUid = getOrCreatePlayerUid();
  const cached = getSavedAssignment(session.id);

  try {
    const team = await assignPlayerAtomically({
      p_session_id: session.id,
      p_player_uid: playerUid,
      p_real_name: profile.realName,
      p_nickname: profile.nickname,
    });
    saveAssignment(session.id, team);
    return { status: "assigned", session, team, profile };
  } catch (assignErr) {
    const message = assignErr instanceof Error ? assignErr.message : "Assignment failed";

    if (isSessionFullError(message)) {
      if (cached && cached.session_id === session.id) {
        return { status: "assigned", session, team: cached, profile };
      }
      return { status: "session_full", session };
    }

    throw assignErr;
  }
}

async function resolvePlayerPhase(): Promise<PlayerPhase> {
  const session = await fetchActiveSession();

  if (!session) {
    return { status: "no_session" };
  }

  const profile = getPlayerProfile();
  if (!profile) {
    return { status: "needs_onboarding", session, initialProfile: null };
  }

  return assignWithProfile(session, profile);
}

export function PlayerContainer() {
  const [phase, setPhase] = useState<PlayerPhase>({ status: "loading" });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const joiningRef = useRef(false);

  const pushToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const runJoin = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;

    try {
      const next = await resolvePlayerPhase();
      setPhase(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (/Missing NEXT_PUBLIC_SUPABASE/i.test(message)) {
        setPhase({
          status: "error",
          message: "App is not configured yet. Ask a mentor to check Supabase env keys.",
        });
      } else {
        setPhase({ status: "error", message });
      }
    } finally {
      joiningRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next = await resolvePlayerPhase();
        if (!cancelled) setPhase(next);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Something went wrong";
        if (/Missing NEXT_PUBLIC_SUPABASE/i.test(message)) {
          setPhase({
            status: "error",
            message: "App is not configured yet. Ask a mentor to check Supabase env keys.",
          });
        } else {
          setPhase({ status: "error", message });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    setPhase({ status: "loading" });
    void runJoin();
  };

  const handleOnboarding = async (profile: PlayerProfile) => {
    if (phase.status !== "needs_onboarding") return;
    setOnboardingBusy(true);
    try {
      savePlayerProfile(profile);
      const next = await assignWithProfile(phase.session, profile);
      setPhase(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ status: "error", message });
    } finally {
      setOnboardingBusy(false);
    }
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {phase.status === "loading" ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PlayerAssignmentSkeleton />
          </motion.div>
        ) : null}

        {phase.status === "needs_onboarding" ? (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <OnboardingModal
              initial={phase.initialProfile}
              busy={onboardingBusy}
              onSubmit={handleOnboarding}
            />
          </motion.div>
        ) : null}

        {phase.status === "no_session" ? (
          <motion.div
            key="no-session"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <NoActiveSessionView onRetry={retry} />
          </motion.div>
        ) : null}

        {phase.status === "session_full" ? (
          <motion.div
            key="full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SessionFullView
              sessionLabel={phase.session.date_label}
              onRetry={retry}
            />
          </motion.div>
        ) : null}

        {phase.status === "assigned" ? (
          <motion.div
            key={`assigned-${phase.team.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AssignedTeamView
              session={phase.session}
              team={phase.team}
              profile={phase.profile}
              onToast={pushToast}
            />
          </motion.div>
        ) : null}

        {phase.status === "error" ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center"
          >
            <AlertCircle className="mb-3 size-8 text-rose-400" />
            <h1 className="text-xl font-black text-white">Could not join</h1>
            <p className="mt-2 text-sm text-slate-400">{phase.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-6 min-h-12 rounded-2xl bg-teal-500 px-5 py-3 text-sm font-bold text-slate-950"
            >
              Retry
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <PlayerToastStack
        items={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
