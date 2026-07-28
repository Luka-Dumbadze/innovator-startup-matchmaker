"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pause, RotateCcw, Timer, Dices } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createBrowserSupabaseClient, setSessionVotingState } from "@/lib/supabase/client";
import { hostTeamTitle } from "@/lib/constants/host-labels";
import {
  MODE_SECONDS,
  broadcastTimerEvent,
  formatTimerClock,
  normalizeTeamId,
  resolvePitchIdea,
  resolvePitcher,
  selectNextPitchTeam,
  sessionTimerChannelName,
  DEFAULT_PITCHER_NICKNAME,
  type PitchRosterMember,
  type PitchSelectedPayload,
  type TimerMode,
} from "@/lib/timer/session-timer";
import type { Team } from "@/types/game";

import type { PitchSpotlightData } from "@/components/host/PitchSpotlightCard";

/** Short descending chime via Web Audio API (host local feedback). */
function playChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [880, 1174.66, 1318.51];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // Autoplay / unsupported — ignore.
  }
}

function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

const START_BUTTONS: { mode: TimerMode; label: string }[] = [
  { mode: "solo_brainstorm", label: "▶️ 2-წთ ინდივიდუალური დაწყება" },
  { mode: "team_brainstorm", label: "▶️ 10-წთ გუნდური დაწყება" },
  { mode: "pitch", label: "▶️ 1-წთ პიჩის დაწყება" },
];

const MODE_LABELS_KA: Record<TimerMode, string> = {
  solo_brainstorm: "🤫 ინდივიდუალური ბრეინსტორმი",
  team_brainstorm: "🤝 გუნდური ბრეინსტორმი",
  pitch: "🎤 პიჩინგი",
};

type StageSelection = {
  team: Team;
  pitcherUid: string;
  pitcherNickname: string;
  pitcherRealName: string;
  startupName: string;
  solution: string;
  tools: string;
  nextUpTeam: Team | null;
  progressText: string;
  pitchedCount: number;
};

export type PitchProjectionState = {
  active: boolean;
  spotlight: PitchSpotlightData | null;
  onDeclineAndRerollPitcher?: () => void;
  onOpenVoting?: () => void;
  onCloseVoting?: () => void;
  rerollPending?: boolean;
  votingPending?: boolean;
  rerollDisabled?: boolean;
};

type LiveTimerHostProps = {
  sessionId: string;
  teams: Team[];
  className?: string;
  onProjectionChange?: (state: PitchProjectionState) => void;
};

export function LiveTimerHost({
  sessionId,
  teams,
  className = "",
  onProjectionChange,
}: LiveTimerHostProps) {
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.team_number - b.team_number),
    [teams]
  );

  const [mode, setMode] = useState<TimerMode>("solo_brainstorm");
  const [remaining, setRemaining] = useState(MODE_SECONDS.solo_brainstorm);
  const [running, setRunning] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [pitchedTeamIds, setPitchedTeamIds] = useState<string[]>([]);
  const [stage, setStage] = useState<StageSelection | null>(null);
  const [declinedPitcherUids, setDeclinedPitcherUids] = useState<string[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickPending, startPick] = useTransition();

  const [votingOpen, setVotingOpen] = useState(false);
  const [votingPending, startVotingTransition] = useTransition();
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);

  const chimedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const modeRef = useRef(mode);
  const endsAtRef = useRef<number | null>(null);
  const stageTeamIdRef = useRef<string | null>(null);
  const stageRef = useRef<StageSelection | null>(null);
  const votingOpenRef = useRef(false);
  const likesRef = useRef(0);
  const dislikesRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    stageTeamIdRef.current = stage?.team.id ?? null;
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    votingOpenRef.current = votingOpen;
  }, [votingOpen]);

  const activeTeam = useMemo(() => {
    if (!stage) return null;
    return sortedTeams.find((t) => t.id === stage.team.id) ?? stage.team;
  }, [stage, sortedTeams]);

  const pitchProjectionActive = !!stage && !!activeTeam;

  const duration = MODE_SECONDS[mode];
  const progress = remaining / duration;
  const isUrgent = remaining > 0 && remaining <= 10;
  const isDone = remaining === 0;
  const pitchedCount = pitchedTeamIds.length;
  const totalTeams = sortedTeams.length;
  const progressRatio = totalTeams === 0 ? 0 : pitchedCount / totalTeams;

  const ringColor = useMemo(() => {
    if (votingOpen) return "#38bdf8";
    if (isDone || isUrgent) return "#f43f5e";
    if (progress <= 0.33) return "#eab308";
    return "#22c55e";
  }, [isDone, isUrgent, progress, votingOpen]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(sessionTimerChannelName(sessionId), {
      config: { broadcast: { self: false } },
    });

    channel.subscribe((status) => {
      setChannelReady(status === "SUBSCRIBED");
    });

    channelRef.current = channel;

    return () => {
      setChannelReady(false);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!stage) return;
    const teamId = stage.team.id;
    const supabase = createBrowserSupabaseClient();

    const loadTallies = async () => {
      const { data } = await supabase
        .from("submitted_ideas")
        .select("likes_count, dislikes_count")
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("is_final_team_pitch", true)
        .maybeSingle();
      if (data) {
        setLikesCount(Number(data.likes_count ?? 0));
        setDislikesCount(Number(data.dislikes_count ?? 0));
      }
    };

    void loadTallies();

    const channel = supabase
      .channel(`pitch-votes-${sessionId}-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "submitted_ideas",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const row = payload.new as {
            likes_count?: number;
            dislikes_count?: number;
            is_final_team_pitch?: boolean;
          };
          if (row.is_final_team_pitch === false) return;
          setLikesCount(Number(row.likes_count ?? 0));
          setDislikesCount(Number(row.dislikes_count ?? 0));
          void broadcastTimerEvent(channelRef.current, "VOTE_TALLY", {
            teamId,
            likesCount: Number(row.likes_count ?? 0),
            dislikesCount: Number(row.dislikes_count ?? 0),
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, stage]);

  const clearTick = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const broadcastPitchSelected = useCallback(
    (selection: StageSelection) => {
      const payload: PitchSelectedPayload = {
        teamId: selection.team.id,
        teamName: hostTeamTitle(selection.team.team_number, selection.team.name),
        teamColor: selection.team.color,
        selectedPitcherUid: selection.pitcherUid,
        selectedPitcherNickname: selection.pitcherNickname,
        selectedPitcherRealName: selection.pitcherRealName,
        startupName: selection.startupName,
        solution: selection.solution,
        tools: selection.tools,
        toolWords: selection.team.words,
        nextUpTeamName: selection.nextUpTeam
          ? hostTeamTitle(selection.nextUpTeam.team_number, selection.nextUpTeam.name)
          : null,
        nextUpTeamColor: selection.nextUpTeam?.color ?? null,
        progressText: selection.progressText,
        pitchedCount: selection.pitchedCount,
        totalTeams: sortedTeams.length,
      };
      void broadcastTimerEvent(channelRef.current, "PITCH_SELECTED", payload);
    },
    [sortedTeams.length]
  );

  const fetchRoster = useCallback(
    async (teamId: string): Promise<PitchRosterMember[]> => {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from("player_assignments")
        .select("player_uid, nickname, real_name")
        .eq("session_id", sessionId)
        .eq("team_id", teamId);
      if (error) {
        console.error("[pitch-select] roster fetch failed", { teamId, error });
        throw new Error(error.message);
      }
      return (data ?? []).map((m) => ({
        player_uid: m.player_uid,
        nickname: m.nickname ?? "",
        real_name: m.real_name ?? "",
      }));
    },
    [sessionId]
  );

  /**
   * Idea fetch must NEVER block pitch selection. Missing rows / query errors
   * resolve to null so `resolvePitchIdea` can supply the fallback copy.
   */
  const fetchFinalIdea = useCallback(
    async (teamId: string) => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from("submitted_ideas")
          .select(
            "startup_name, one_sentence_solution, tools_integration, author_nickname, likes_count, dislikes_count"
          )
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("is_final_team_pitch", true)
          .maybeSingle();
        if (error) {
          console.warn("[pitch-select] idea fetch error — using fallback", {
            teamId,
            error,
          });
          return null;
        }
        return data;
      } catch (err) {
        console.warn("[pitch-select] idea fetch threw — using fallback", {
          teamId,
          err,
        });
        return null;
      }
    },
    [sessionId]
  );

  const pickNextTeamAndPitcher = useCallback(() => {
    startPick(async () => {
      try {
        setPickError(null);

        const step = selectNextPitchTeam(sortedTeams, pitchedTeamIds);
        if (step.done) {
          setPickError("ყველა გუნდი უკვე გაფიჩულია");
          return;
        }

        const { chosen, nextPitchedIds, remainingAfter } = step;
        const teamId = normalizeTeamId(chosen.id);

        const [roster, idea] = await Promise.all([
          fetchRoster(teamId).catch((err) => {
            console.warn("[pitch-select] roster unavailable — using fallback pitcher", err);
            return [] as PitchRosterMember[];
          }),
          fetchFinalIdea(teamId),
        ]);

        const pitcher = resolvePitcher(roster);
        const pitch = resolvePitchIdea(idea);
        const nextUp = pickRandom(remainingAfter);
        const count = nextPitchedIds.length;
        const progressText = `${count} / ${sortedTeams.length} გუნდი გაფიჩულია`;

        const selection: StageSelection = {
          team: chosen,
          pitcherUid: pitcher.player_uid,
          pitcherNickname:
            pitcher.nickname ||
            idea?.author_nickname ||
            DEFAULT_PITCHER_NICKNAME,
          pitcherRealName: pitcher.real_name,
          startupName: pitch.startup_name,
          solution: pitch.one_sentence_solution,
          tools: pitch.tools_integration,
          nextUpTeam: nextUp,
          progressText,
          pitchedCount: count,
        };

        setPitchedTeamIds(nextPitchedIds);
        setDeclinedPitcherUids([]);
        setStage(selection);
        setLikesCount(Number(idea?.likes_count ?? 0));
        setDislikesCount(Number(idea?.dislikes_count ?? 0));
        // Close any prior voting window when advancing to the next team.
        if (votingOpenRef.current) {
          try {
            await setSessionVotingState({
              sessionId,
              votingOpen: false,
            });
          } catch (err) {
            console.warn("[pitch-select] failed to close prior voting", err);
          }
          void broadcastTimerEvent(channelRef.current, "VOTING_CLOSED", {
            teamId: normalizeTeamId(chosen.id),
            likesCount: likesRef.current,
            dislikesCount: dislikesRef.current,
          });
        }
        setVotingOpen(false);
        broadcastPitchSelected(selection);
      } catch (err) {
        console.error("[pitch-select] unexpected error in pickNextTeamAndPitcher", err);
        setPickError(
          err instanceof Error ? err.message : "არჩევა ვერ მოხერხდა — სცადეთ თავიდან"
        );
      }
    });
  }, [
    sessionId,
    sortedTeams,
    pitchedTeamIds,
    fetchRoster,
    fetchFinalIdea,
    broadcastPitchSelected,
  ]);

  const openVoting = useCallback(() => {
    startVotingTransition(async () => {
      try {
        setPickError(null);
        const current = stageRef.current;
        if (!current) {
          setPickError("ჯერ აირჩიეთ გუნდი & პრეზენტატორი");
          return;
        }

        const teamId = normalizeTeamId(current.team.id);
        await setSessionVotingState({
          sessionId,
          votingOpen: true,
          votingTeamId: teamId,
        });

        setVotingOpen(true);
        const teamName = hostTeamTitle(current.team.team_number, current.team.name);
        void broadcastTimerEvent(channelRef.current, "VOTING_OPENED", {
          teamId,
          teamName,
          teamColor: current.team.color,
          likesCount: likesRef.current,
          dislikesCount: dislikesRef.current,
        });
      } catch (err) {
        console.error("[voting] open failed", err);
        setPickError(
          err instanceof Error ? err.message : "ხმის მიცემის გახსნა ვერ მოხერხდა"
        );
      }
    });
  }, [sessionId]);

  const closeVoting = useCallback(() => {
    startVotingTransition(async () => {
      try {
        setPickError(null);
        const current = stageRef.current;
        const teamId = current ? normalizeTeamId(current.team.id) : "";

        await setSessionVotingState({
          sessionId,
          votingOpen: false,
        });

        setVotingOpen(false);
        void broadcastTimerEvent(channelRef.current, "VOTING_CLOSED", {
          teamId,
          likesCount: likesRef.current,
          dislikesCount: dislikesRef.current,
        });
      } catch (err) {
        console.error("[voting] close failed", err);
        setPickError(
          err instanceof Error ? err.message : "ხმის მიცემის დახურვა ვერ მოხერხდა"
        );
      }
    });
  }, [sessionId]);

  const rerollPitcher = useCallback(() => {
    startPick(async () => {
      try {
        setPickError(null);
        const current = stageRef.current;
        if (!current) {
          setPickError("ჯერ აირჩიეთ გუნდი");
          return;
        }

        const roster = await fetchRoster(normalizeTeamId(current.team.id)).catch(
          (err) => {
            console.warn("[pitch-reroll] roster unavailable", err);
            return [] as PitchRosterMember[];
          }
        );
        const declined = [
          ...new Set([...declinedPitcherUids, current.pitcherUid]),
        ];
        const pitcher = resolvePitcher(roster, { declinedUids: declined });

        if (pitcher.isFallback) {
          setPickError("სხვა ხელმისაწვდომი წევრი ამ გუნდში არ არის");
          return;
        }

        const next: StageSelection = {
          ...current,
          pitcherUid: pitcher.player_uid,
          pitcherNickname: pitcher.nickname,
          pitcherRealName: pitcher.real_name,
        };

        setDeclinedPitcherUids(declined);
        setStage(next);
        broadcastPitchSelected(next);
      } catch (err) {
        console.error("[pitch-reroll] unexpected error", err);
        setPickError(err instanceof Error ? err.message : "Re-roll ვერ მოხერხდა");
      }
    });
  }, [declinedPitcherUids, fetchRoster, broadcastPitchSelected]);

  useEffect(() => {
    if (!onProjectionChange) return;

    if (!pitchProjectionActive || !stage || !activeTeam) {
      onProjectionChange({ active: false, spotlight: null });
      return;
    }

    onProjectionChange({
      active: true,
      spotlight: {
        team: activeTeam,
        pitcherNickname: stage.pitcherNickname,
        startupName: stage.startupName,
        solution: stage.solution,
        toolsIntegration: stage.tools,
        likesCount,
        dislikesCount,
        pitchSecondsRemaining: mode === "pitch" ? remaining : MODE_SECONDS.pitch,
        votingSecondsRemaining: 0,
        votingOpen,
        pitchLive: mode === "pitch" && running && !votingOpen,
      },
      onDeclineAndRerollPitcher: rerollPitcher,
      onOpenVoting: openVoting,
      onCloseVoting: closeVoting,
      rerollPending: pickPending,
      votingPending,
      rerollDisabled: pickPending || votingOpen || votingPending,
    });
  }, [
    onProjectionChange,
    stage,
    activeTeam,
    pitchProjectionActive,
    likesCount,
    dislikesCount,
    remaining,
    votingOpen,
    mode,
    running,
    rerollPitcher,
    openVoting,
    closeVoting,
    pickPending,
    votingPending,
  ]);

  useEffect(() => {
    likesRef.current = likesCount;
    dislikesRef.current = dislikesCount;
  }, [likesCount, dislikesCount]);

  const startMode = useCallback(
    (next: TimerMode, seconds?: number) => {
      if (next === "pitch" && !stageTeamIdRef.current) {
        setPickError("ჯერ აირჩიეთ გუნდი & პრეზენტატორი");
        return;
      }

      const secs = seconds ?? MODE_SECONDS[next];
      const endsAt = Date.now() + secs * 1000;
      endsAtRef.current = endsAt;
      setMode(next);
      setRemaining(secs);
      chimedRef.current = false;
      setRunning(true);

      const teamName = stage
        ? hostTeamTitle(stage.team.team_number, stage.team.name)
        : undefined;

      void broadcastTimerEvent(channelRef.current, "TIMER_STARTED", {
        mode: next,
        secondsRemaining: secs,
        endsAt,
        ...(next === "pitch" && stageTeamIdRef.current
          ? {
              activeTeamId: stageTeamIdRef.current,
              teamName,
              selectedPitcherUid: stage?.pitcherUid,
              selectedPitcherNickname: stage?.pitcherNickname,
            }
          : {}),
      });

      if (next === "pitch" && stageTeamIdRef.current && teamName) {
        void broadcastTimerEvent(channelRef.current, "PITCH_STARTED", {
          activeTeamId: stageTeamIdRef.current,
          teamName,
          secondsRemaining: secs,
          endsAt,
          selectedPitcherUid: stage?.pitcherUid,
          selectedPitcherNickname: stage?.pitcherNickname,
        });
      }
    },
    [stage]
  );

  useEffect(() => {
    if (!running) {
      clearTick();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const endsAt = endsAtRef.current;
      if (endsAt != null) {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) {
          clearTick();
          setRunning(false);
        }
        return;
      }

      setRemaining((prev) => {
        if (prev <= 1) {
          clearTick();
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 250);

    return clearTick;
  }, [running]);

  useEffect(() => {
    if (remaining !== 0 || chimedRef.current || running) {
      if (remaining > 0) chimedRef.current = false;
      return;
    }

    chimedRef.current = true;
    endsAtRef.current = null;
    const expiredMode = modeRef.current;
    const targetTeamId = stageTeamIdRef.current ?? undefined;
    playChime();
    void broadcastTimerEvent(channelRef.current, "TIMER_EXPIRED", {
      mode: expiredMode,
      secondsRemaining: 0,
      ...(expiredMode === "pitch" && targetTeamId ? { targetTeamId } : {}),
    });

    if (expiredMode === "pitch" && targetTeamId) {
      void broadcastTimerEvent(channelRef.current, "PITCH_EXPIRED", {
        targetTeamId,
      });
      // Voting does NOT open automatically — mentor must press Open Voting.
    }
  }, [remaining, running]);

  useEffect(() => {
    return () => {
      clearTick();
    };
  }, []);

  const reset = () => {
    endsAtRef.current = null;
    setRunning(false);
    setRemaining(duration);
    chimedRef.current = false;
    void broadcastTimerEvent(channelRef.current, "TIMER_RESET", {
      mode,
      secondsRemaining: duration,
    });
  };

  const pause = () => {
    if (!running) return;
    endsAtRef.current = null;
    setRunning(false);
    void broadcastTimerEvent(channelRef.current, "TIMER_PAUSED", {
      mode,
      secondsRemaining: remaining,
    });
  };

  const resetPitchQueue = () => {
    setPitchedTeamIds([]);
    setStage(null);
    setDeclinedPitcherUids([]);
    setPickError(null);
    setVotingOpen(false);
    setLikesCount(0);
    setDislikesCount(0);
    void setSessionVotingState({ sessionId, votingOpen: false }).catch((err) => {
      console.warn("[pitch-queue] failed to clear voting state", err);
    });
  };

  const size = 120;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayRemaining = remaining;
  const displayProgress = progress;
  const dashOffset = circumference * (1 - displayProgress);

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 overflow-auto rounded-3xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_0_50px_-20px_rgba(45,212,191,0.35)] backdrop-blur-xl xl:p-5 ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-[family-name:var(--font-noto-georgian)] text-sm font-bold tracking-wide text-slate-200">
          <Timer className="size-4 text-teal-300" />
          ⏱️ მენტორის პანელი
        </div>
        <span
          className={`size-2 rounded-full ${channelReady ? "bg-emerald-400" : "bg-slate-600"}`}
          title={channelReady ? "არხი მზადაა" : "იკავშირება…"}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 rounded-xl bg-slate-950/80 p-1.5 ring-1 ring-slate-700">
        {START_BUTTONS.map(({ mode: key, label }) => {
          const active = mode === key && (running || remaining < MODE_SECONDS[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => startMode(key)}
              className={`rounded-lg px-2.5 py-2.5 text-left font-[family-name:var(--font-noto-georgian)] text-xs font-bold transition xl:text-sm ${
                active
                  ? "bg-teal-500 text-slate-950 ring-2 ring-teal-300/60"
                  : "bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="shrink-0 space-y-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
        <button
          type="button"
          onClick={pickNextTeamAndPitcher}
          disabled={pickPending || pitchedCount >= totalTeams}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Dices className="size-4" />
          {pickPending ? "ირჩევა…" : "🎲 შემდეგი გუნდის & პრეზენტატორის არჩევა"}
        </button>

        <div>
          <div className="mb-1 flex items-center justify-between font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-amber-100">
            <span>პიჩის პროგრესი</span>
            <span className="tabular-nums">
              {pitchedCount} / {totalTeams} გუნდი
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-950/80 ring-1 ring-amber-400/30">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-300"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-[11px] text-amber-100/80">
            {stage?.progressText ?? "ჯერ არავინ გაუფიჩავს"}
          </p>
        </div>

        {stage ? (
          <div className="rounded-lg bg-slate-950/70 px-3 py-2 ring-1 ring-emerald-500/30">
            <p className="font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-emerald-200">
              🎤 აქტიური: {hostTeamTitle(stage.team.team_number, stage.team.name)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {stage.pitcherNickname}
            </p>
            <button
              type="button"
              onClick={rerollPitcher}
              disabled={pickPending || votingOpen || votingPending}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2.5 font-[family-name:var(--font-noto-georgian)] text-xs font-black text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50 xl:text-sm"
            >
              ❌ უარი თქვა ➔ 🎲 სხვა წევრის ამოგდება
              <span className="hidden xl:inline">(Re-roll Pitcher)</span>
            </button>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={openVoting}
                disabled={!stage || votingOpen || votingPending}
                className="flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-3 py-2.5 font-[family-name:var(--font-noto-georgian)] text-xs font-black text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 xl:text-sm"
              >
                {votingPending && !votingOpen
                  ? "იხსნება…"
                  : "🗳️ ხმის მიცემის გახსნა (Open Voting)"}
              </button>
              <button
                type="button"
                onClick={closeVoting}
                disabled={!votingOpen || votingPending}
                className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-500 bg-slate-800 px-3 py-2.5 font-[family-name:var(--font-noto-georgian)] text-xs font-black text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 xl:text-sm"
              >
                {votingPending && votingOpen
                  ? "იხურება…"
                  : "🔒 ხმის მიცემის დახურვა (Close Voting)"}
              </button>
            </div>
          </div>
        ) : null}

        {stage?.nextUpTeam ? (
          <div
            className="flex items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2 ring-1 ring-slate-600"
            style={{ borderLeft: `4px solid ${stage.nextUpTeam.color}` }}
          >
            <span className="font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-slate-200">
              ⏭️ Next Up:{" "}
              {hostTeamTitle(stage.nextUpTeam.team_number, stage.nextUpTeam.name)}
            </span>
          </div>
        ) : stage && pitchedCount >= totalTeams ? (
          <p className="font-[family-name:var(--font-noto-georgian)] text-xs font-semibold text-emerald-300">
            ✅ ყველა გუნდი გაფიჩულია
          </p>
        ) : null}

        {pickError ? (
          <p className="font-[family-name:var(--font-noto-georgian)] text-xs text-rose-300">
            {pickError}
          </p>
        ) : null}

        {pitchedCount > 0 ? (
          <button
            type="button"
            onClick={resetPitchQueue}
            className="text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            პიჩის რიგის გადატვირთვა
          </button>
        ) : null}
      </div>

      <p className="shrink-0 text-center font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-slate-400">
        {votingOpen ? "🗳️ ხმის მიცემა" : MODE_LABELS_KA[mode]}
        {running || votingOpen ? (
          <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-rose-200">
            LIVE
          </span>
        ) : null}
      </p>

      <div className="relative mx-auto flex size-[120px] shrink-0 items-center justify-center">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <p
          className={`absolute font-mono text-4xl font-black tabular-nums ${
            votingOpen
              ? "text-sky-300"
              : isUrgent || isDone
                ? "text-rose-400"
                : "text-white"
          }`}
        >
          {formatTimerClock(displayRemaining)}
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          onClick={pause}
          disabled={!running}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-white ring-1 ring-slate-600 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pause className="size-4" />
          ⏸️ პაუზა
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-white ring-1 ring-slate-600 transition hover:bg-slate-700"
        >
          <RotateCcw className="size-4" />
          🔄 გადატვირთვა
        </button>
      </div>
    </div>
  );
}
