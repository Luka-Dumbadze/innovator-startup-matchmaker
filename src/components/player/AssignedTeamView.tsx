"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic2, Timer, Users, X } from "lucide-react";

import type { DailySession, IdeaNotes, PlayerProfile, Team } from "@/types/game";
import { ElevatorPitchView } from "@/components/player/ElevatorPitchView";
import { IdeaNotesCanvas } from "@/components/player/IdeaNotesCanvas";
import { TeamIdeaHub } from "@/components/player/TeamIdeaHub";
import { TimerExpiredModal } from "@/components/player/TimerExpiredModal";
import { useSessionTimerSync } from "@/hooks/useSessionTimerSync";
import { submitFinalTeamPitch } from "@/lib/supabase/client";
import {
  MODE_SECONDS,
  MODE_SHORT_LABELS,
  PHASE_GUIDANCE,
  formatTimerClock,
  type TimerMode,
} from "@/lib/timer/session-timer";
import {
  getIdeaNotes,
  getOrCreatePlayerUid,
  isPitchSubmitted,
  markPitchSubmitted,
  saveTeamFoundation,
} from "@/lib/utils/player-storage";
import { TOOL_SLOT_META } from "@/lib/constants/preset-words";
import type { PitchSelectionState } from "@/hooks/useSessionTimerSync";

type AssignedTeamViewProps = {
  session: DailySession;
  team: Team;
  profile: PlayerProfile;
  onToast?: (message: string, tone?: "success" | "error") => void;
};

function PitcherStageHero({
  selection,
  onDismiss,
}: {
  selection: PitchSelectionState;
  onDismiss: () => void;
}) {
  const words =
    selection.toolWords.length > 0
      ? selection.toolWords
      : ["—", "—", "—"];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="შენი ჯერია პრეზენტატორად"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        initial={{ y: 40, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="relative max-h-[92vh] w-full max-w-md overflow-auto rounded-3xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/25 via-emerald-500/15 to-slate-950 p-5 shadow-[0_0_60px_-8px_rgba(251,191,36,0.65)]"
        style={{
          borderTopWidth: 6,
          borderTopColor: selection.teamColor ?? "#fbbf24",
        }}
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 rounded-full bg-slate-900/80 p-2 text-slate-300 ring-1 ring-slate-600 hover:text-white"
          aria-label="დახურვა"
        >
          <X className="size-4" />
        </button>

        <motion.p
          animate={{ scale: [1, 1.03, 1], opacity: [1, 0.85, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="pr-8 font-[family-name:var(--font-noto-georgian)] text-xl font-black leading-snug text-amber-100"
        >
          🎉 შენი ჯერია! სისტემამ აგირჩია პრეზენტატორად! 🎤
        </motion.p>

        <p className="mt-2 font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-emerald-200">
          {selection.teamName}
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">
              Startup
            </p>
            <p className="text-3xl font-black leading-tight text-white">
              {selection.startupName}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">
              1-Sentence Solution
            </p>
            <p className="font-[family-name:var(--font-noto-georgian)] text-xl leading-relaxed font-bold text-slate-50">
              {selection.solution}
            </p>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">
              3 Innovation Tools
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TOOL_SLOT_META.map((slot, i) => (
                <div
                  key={slot.label}
                  className="rounded-xl bg-slate-950/80 px-2 py-3 text-center ring-1 ring-emerald-400/30"
                >
                  <p className="text-sm" aria-hidden>
                    {slot.icon}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-teal-100">
                    {words[i] ?? "—"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-[family-name:var(--font-noto-georgian)] text-base leading-relaxed text-slate-200">
              {selection.tools}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 font-[family-name:var(--font-noto-georgian)] text-base font-black text-slate-950"
        >
          <Mic2 className="size-5" />
          მზად ვარ სცენისთვის
        </button>
      </motion.div>
    </motion.div>
  );
}

const BANNER_STYLES: Record<
  TimerMode,
  { wrap: string; title: string; body: string }
> = {
  solo_brainstorm: {
    wrap: "border-violet-400/40 bg-violet-500/15",
    title: "text-violet-100",
    body: "text-violet-200/90",
  },
  team_brainstorm: {
    wrap: "border-teal-400/40 bg-teal-500/15",
    title: "text-teal-100",
    body: "text-teal-200/90",
  },
  pitch: {
    wrap: "border-amber-400/40 bg-amber-500/15",
    title: "text-amber-100",
    body: "text-amber-200/90",
  },
};

export function AssignedTeamView({
  session,
  team,
  profile,
  onToast,
}: AssignedTeamViewProps) {
  const isFull = team.current_count >= team.max_capacity;
  const timer = useSessionTimerSync(session.id, team.id);
  const guidance = PHASE_GUIDANCE[timer.mode];
  const bannerStyle = BANNER_STYLES[timer.mode];

  const [playerUid] = useState(() => getOrCreatePlayerUid());
  const [localNotes, setLocalNotes] = useState<IdeaNotes>(() => getIdeaNotes(session.id));
  const [foundationNotes, setFoundationNotes] = useState<IdeaNotes | null>(null);
  const [locked, setLocked] = useState(() => isPitchSubmitted(session.id));
  const [submitted, setSubmitted] = useState(() => isPitchSubmitted(session.id));
  const submittingRef = useRef(false);
  const localNotesRef = useRef(localNotes);

  useEffect(() => {
    localNotesRef.current = localNotes;
  }, [localNotes]);

  const onNotesChange = useCallback((notes: IdeaNotes) => {
    setLocalNotes(notes);
  }, []);

  const useAsFoundation = useCallback(
    (idea: IdeaNotes) => {
      saveTeamFoundation(session.id, idea);
      setFoundationNotes({ ...idea });
      setLocalNotes(idea);
      onToast?.(`Using ${idea.startupName.trim() || "teammate"} idea as foundation`, "success");
    },
    [onToast, session.id]
  );

  // Unlock audio context on first user gesture so alarm / chimes can play later.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        void ctx.resume().then(() => void ctx.close());
      } catch {
        // ignore
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Auto-submit once when the team brainstorm (or pitch window) ends — not on every
  // subsequent per-team pitch start.
  useEffect(() => {
    const timedOut =
      timer.expiredAlert || (timer.secondsRemaining === 0 && !timer.running);
    if (!timedOut) return;
    if (timer.mode === "solo_brainstorm") return;
    // Pitch expiry alarms are team-targeted; only the presenting team (or a prior
    // team-brainstorm expiry) should lock/submit.
    if (timer.mode === "pitch" && timer.activePitchTeamId && timer.activePitchTeamId !== team.id) {
      return;
    }
    if (submitted || submittingRef.current) return;

    submittingRef.current = true;
    setLocked(true);

    const notes = localNotesRef.current;

    void (async () => {
      try {
        await submitFinalTeamPitch({
          sessionId: session.id,
          teamId: team.id,
          playerUid,
          realName: profile.realName,
          nickname: profile.nickname,
          notes,
        });
        markPitchSubmitted(session.id);
        setSubmitted(true);
        onToast?.("Team pitch auto-submitted", "success");
      } catch (err) {
        submittingRef.current = false;
        const message = err instanceof Error ? err.message : "Auto-submit failed";
        onToast?.(message, "error");
      }
    })();
  }, [
    timer.expiredAlert,
    timer.secondsRemaining,
    timer.running,
    timer.mode,
    timer.activePitchTeamId,
    submitted,
    session.id,
    team.id,
    playerUid,
    profile.nickname,
    profile.realName,
    onToast,
  ]);

  const timerUrgent = timer.secondsRemaining > 0 && timer.secondsRemaining <= 10;
  const timerVisible =
    timer.running ||
    timer.expiredAlert ||
    timer.secondsRemaining < MODE_SECONDS[timer.mode];
  const hubActive = timer.mode === "team_brainstorm" && !submitted;

  const pitchSelection = timer.pitchSelection;
  const isMyTeamOnStage =
    !!pitchSelection && pitchSelection.teamId === team.id;
  const isSelectedPitcher =
    isMyTeamOnStage && pitchSelection.selectedPitcherUid === playerUid;
  const isTeammateOnStage = isMyTeamOnStage && !isSelectedPitcher;

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 py-6 pb-10">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="text-[11px] font-bold tracking-[0.2em] text-teal-400 uppercase">
          {session.date_label}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">You&apos;re in!</h1>
        <p className="mt-1 text-sm text-slate-400">
          Playing as <span className="font-semibold text-teal-300">{profile.nickname}</span>
        </p>

        {timerVisible ? (
          <motion.div
            layout
            className={`mt-4 inline-flex min-w-[11rem] flex-col items-center gap-0.5 rounded-2xl px-5 py-3 font-mono ring-2 ${
              timer.expiredAlert || timer.secondsRemaining === 0
                ? "bg-rose-500/25 text-rose-200 ring-rose-400/60"
                : timerUrgent
                  ? "bg-amber-500/25 text-amber-100 ring-amber-400/50"
                  : "bg-slate-900 text-teal-200 ring-teal-500/40"
            }`}
          >
            <span className="flex items-center gap-2 text-3xl font-black tabular-nums tracking-tight">
              <Timer className="size-5" />
              {formatTimerClock(timer.secondsRemaining)}
            </span>
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-80">
              {MODE_SHORT_LABELS[timer.mode]}
              {timer.running ? " · LIVE" : timer.expiredAlert ? " · ENDED" : ""}
            </span>
          </motion.div>
        ) : null}
      </motion.header>

      <AnimatePresence>
        {isTeammateOnStage && pitchSelection ? (
          <motion.div
            key="teammate-on-stage"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="rounded-2xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-3 text-left shadow-[0_0_30px_-10px_rgba(16,185,129,0.55)]"
          >
            <p className="font-[family-name:var(--font-noto-georgian)] text-base font-black text-emerald-50">
              🎤 თქვენი გუნდი სცენაზეა! პრეზენტატორი:{" "}
              {pitchSelection.selectedPitcherNickname}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {(timer.running || timerVisible) && !submitted && !timer.expiredAlert ? (
          <motion.div
            key={timer.mode}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className={`rounded-2xl border px-4 py-3 text-left ${bannerStyle.wrap}`}
          >
            <p
              className={`font-[family-name:var(--font-noto-georgian)] text-base font-black leading-snug ${bannerStyle.title}`}
            >
              {guidance.title}
            </p>
            <p
              className={`mt-1 font-[family-name:var(--font-noto-georgian)] text-sm leading-relaxed ${bannerStyle.body}`}
            >
              {guidance.instruction}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_0_40px_-12px_rgba(45,212,191,0.35)]"
        style={{ borderTopWidth: 5, borderTopColor: team.color }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-bold text-slate-300 ring-1 ring-slate-700">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                Team {team.team_number}
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white">{team.name}</h2>
            </div>
            <div className="rounded-2xl bg-slate-950/80 px-3 py-2 text-right ring-1 ring-slate-700">
              <p className="flex items-center justify-end gap-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                <Users className="size-3" />
                Seats
              </p>
              <p className="font-mono text-lg font-black tabular-nums text-white">
                {team.current_count}
                <span className="text-slate-500">/{team.max_capacity}</span>
              </p>
              {isFull ? (
                <p className="text-[10px] font-bold text-emerald-400">FULL</p>
              ) : null}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-2xl bg-amber-500/15 px-4 py-4 ring-1 ring-amber-400/40"
          >
            <p className="text-xs font-bold tracking-[0.14em] text-amber-200/90 uppercase">
              🌍 გლობალური მისია
            </p>
            <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-xl font-black leading-snug text-amber-50">
              {team.domain || "—"}
            </p>
          </motion.div>

          <p className="mt-4 mb-2 text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
            3 ინოვაციის ინსტრუმენტი
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TOOL_SLOT_META.map((slot, index) => {
              const word = team.words[index] ?? "—";
              return (
                <motion.div
                  key={slot.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * index }}
                  className="rounded-2xl px-2 py-3 text-center ring-1 ring-white/10"
                  style={{
                    background: `linear-gradient(160deg, ${team.color}33, #020617 70%)`,
                  }}
                >
                  <p className="mb-1 text-sm leading-none" aria-hidden>
                    {slot.icon}
                  </p>
                  <p className="text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                    {slot.shortLabel}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-sm font-bold leading-snug text-white">
                    {word}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>

      {submitted ? (
        <ElevatorPitchView
          domain={team.domain}
          words={team.words}
          notes={localNotes}
          onCopied={(msg) => onToast?.(msg, "success")}
          onCopyError={(msg) => onToast?.(msg, "error")}
        />
      ) : (
        <>
          <TeamIdeaHub
            sessionId={session.id}
            teamId={team.id}
            playerUid={playerUid}
            nickname={profile.nickname}
            localNotes={localNotes}
            active={hubActive}
            onUseAsFoundation={useAsFoundation}
          />

          <IdeaNotesCanvas
            key={session.id}
            sessionId={session.id}
            domain={team.domain}
            words={team.words}
            locked={locked}
            externalNotes={foundationNotes}
            onNotesChange={onNotesChange}
            onCopied={(msg) => onToast?.(msg, "success")}
            onCopyError={(msg) => onToast?.(msg, "error")}
          />
        </>
      )}

      <TimerExpiredModal
        open={timer.expiredAlert}
        mode={timer.mode}
        onDismiss={timer.dismissExpiredAlert}
      />

      <AnimatePresence>
        {isSelectedPitcher && pitchSelection ? (
          <PitcherStageHero
            key={`pitcher-${pitchSelection.teamId}-${pitchSelection.selectedPitcherUid}`}
            selection={pitchSelection}
            onDismiss={timer.dismissPitchSelection}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
