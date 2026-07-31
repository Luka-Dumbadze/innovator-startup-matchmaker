"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { BarChart3, Loader2, MonitorPlay, Rocket } from "lucide-react";

import { ToastProvider, useToast } from "@/components/admin/ToastProvider";
import { XyRoundControls } from "@/components/xy/XyRoundControls";
import { XySubmissionProgress } from "@/components/xy/XySubmissionProgress";
import { XyTeamPaperVotes } from "@/components/xy/XyTeamPaperVotes";
import { XyRosterAssignment } from "@/components/xy/XyRosterAssignment";
import { useXyLiveSession } from "@/hooks/useXyLiveSession";
import {
  assignXyPlayerTeamAction,
  createXySessionAction,
  endXySessionAction,
  overrideXyIndividualVoteAction,
  renameXyTeamAction,
  saveXyTeamRoundVotesAction,
  setXyRoundStateAction,
  type XYActionResult,
} from "@/lib/actions/xy-actions";
import { balanceUnassignedPlayers } from "@/lib/xy/roster";
import { computeStandings, resolveRoundNumbers } from "@/lib/xy/scoring";
import type { XYSnapshot, XYVote } from "@/types/xy";

type XyMentorPanelProps = {
  initial: XYSnapshot;
  loadError?: string | null;
};

export function XyMentorPanel(props: XyMentorPanelProps) {
  return (
    <ToastProvider>
      <XyMentorPanelInner {...props} />
    </ToastProvider>
  );
}

function XyMentorPanelInner({ initial, loadError = null }: XyMentorPanelProps) {
  const live = useXyLiveSession(initial);
  const toast = useToast();

  const [selectedRound, setSelectedRound] = useState(
    () => initial.session?.current_round ?? 1
  );
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState("");
  const [roundPending, startRoundTransition] = useTransition();
  const [sessionPending, startSessionTransition] = useTransition();
  const [balancePending, startBalanceTransition] = useTransition();

  const session = live.session;
  const currentRound = session?.current_round ?? 1;
  const votingOpen = session?.voting_open === true;

  const rounds = useMemo(
    () => resolveRoundNumbers(live.individualVotes, live.teamVotes, currentRound),
    [currentRound, live.individualVotes, live.teamVotes]
  );

  // One round beyond the last recorded round is always reachable.
  const maxRound = Math.max(...rounds, currentRound) + 1;

  const standings = useMemo(
    () => computeStandings(live.teams, live.teamVotes),
    [live.teamVotes, live.teams]
  );

  const report = (result: XYActionResult<unknown>, successMessage: string) => {
    if (result.ok) {
      toast.push(successMessage, "success");
    } else {
      toast.push(result.error, "error");
    }
    return result.ok;
  };

  const handleCreateSession = (event: FormEvent) => {
    event.preventDefault();
    const label = sessionLabel.trim() || `XY თამაში ${new Date().toLocaleDateString()}`;
    startSessionTransition(async () => {
      const result = await createXySessionAction(label);
      if (report(result, "სესია შეიქმნა (8 გუნდი)")) {
        setSessionLabel("");
        setSelectedRound(1);
        await live.refresh();
      }
    });
  };

  const handleEndSession = () => {
    if (!session) return;
    startSessionTransition(async () => {
      const result = await endXySessionAction(session.id);
      if (report(result, "სესია დაიხურა")) {
        await live.refresh();
      }
    });
  };

  const handleOpenRound = () => {
    if (!session) return;
    startRoundTransition(async () => {
      const result = await setXyRoundStateAction({
        sessionId: session.id,
        round: selectedRound,
        votingOpen: true,
      });
      if (report(result, `რაუნდი #${selectedRound} გაიხსნა`)) {
        await live.refresh();
      }
    });
  };

  const handleCloseRound = () => {
    if (!session) return;
    startRoundTransition(async () => {
      const result = await setXyRoundStateAction({
        sessionId: session.id,
        round: currentRound,
        votingOpen: false,
      });
      if (report(result, `რაუნდი #${currentRound} დაიხურა`)) {
        await live.refresh();
      }
    });
  };

  const handleAssign = (playerId: string, teamId: string | null) => {
    setPendingPlayerId(playerId);
    startBalanceTransition(async () => {
      const result = await assignXyPlayerTeamAction(playerId, teamId);
      report(result, "გუნდი განახლდა");
      setPendingPlayerId(null);
      await live.refresh();
    });
  };

  const handleRenameTeam = (teamId: string, name: string) => {
    startBalanceTransition(async () => {
      const result = await renameXyTeamAction(teamId, name);
      report(result, "გუნდის სახელი განახლდა");
      await live.refresh();
    });
  };

  const handleAutoBalance = () => {
    const assignments = balanceUnassignedPlayers(live.players, live.teams);
    if (assignments.length === 0) return;

    startBalanceTransition(async () => {
      for (const assignment of assignments) {
        const result = await assignXyPlayerTeamAction(
          assignment.playerId,
          assignment.teamId
        );
        if (!result.ok) {
          toast.push(result.error, "error");
          break;
        }
      }
      toast.push(`${assignments.length} სტუდენტი განაწილდა`, "success");
      await live.refresh();
    });
  };

  const handleOverrideIndividual = (playerId: string, vote: XYVote | null) => {
    if (!session) return;
    setPendingPlayerId(playerId);
    startBalanceTransition(async () => {
      const result = await overrideXyIndividualVoteAction({
        sessionId: session.id,
        round: selectedRound,
        playerId,
        vote,
      });
      report(result, vote ? `ხმა შესწორდა (${vote})` : "ხმა გასუფთავდა");
      setPendingPlayerId(null);
      await live.refresh();
    });
  };

  /** Team paper votes save as a full round so points always stay consistent. */
  const handleSetTeamVote = (teamId: string, vote: XYVote | null) => {
    if (!session) return;
    setPendingTeamId(teamId);

    const existing = new Map(
      live.teamVotes
        .filter((v) => v.round_number === selectedRound)
        .map((v) => [v.team_id, v.vote as XYVote | null])
    );
    existing.set(teamId, vote);

    const votes = live.teams.map((team) => ({
      teamId: team.id,
      vote: existing.get(team.id) ?? null,
    }));

    startBalanceTransition(async () => {
      const result = await saveXyTeamRoundVotesAction({
        sessionId: session.id,
        round: selectedRound,
        votes,
      });
      if (result.ok) {
        toast.push(
          result.data.complete
            ? `რაუნდი #${selectedRound} დაითვლა`
            : `შენახულია (${result.data.scored}/8)`,
          "success"
        );
      } else {
        toast.push(result.error, "error");
      }
      setPendingTeamId(null);
      await live.refresh();
    });
  };

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="mb-2 font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-white">
          XY თამაში (Win-Win სიმულაცია)
        </h1>
        <p className="mb-6 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-400">
          აქტიური სესია არ არის. შექმენით ახალი — ავტომატურად დაემატება 8 გუნდი.
        </p>

        {loadError ? (
          <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {loadError}
          </p>
        ) : null}

        <form
          onSubmit={handleCreateSession}
          className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4"
        >
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              სესიის სახელი
            </span>
            <input
              type="text"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              placeholder="XY თამაში — დღე 3"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 font-[family-name:var(--font-noto-georgian)] text-base text-white outline-none focus:border-teal-500"
            />
          </label>
          <button
            type="submit"
            disabled={sessionPending}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-4 py-3 font-[family-name:var(--font-noto-georgian)] text-base font-black text-slate-950 transition hover:bg-teal-400 disabled:opacity-60"
          >
            {sessionPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Rocket className="size-4" />
                სესიის შექმნა
              </>
            )}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-teal-400 uppercase">
            XY · Win-Win Simulation
          </p>
          <h1 className="font-[family-name:var(--font-noto-georgian)] text-2xl font-black text-white">
            {session.label}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/xy/scoreboard"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
          >
            <MonitorPlay className="size-4" /> Scoreboard
          </Link>
          <Link
            href="/xy/analytics"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
          >
            <BarChart3 className="size-4" /> Analytics
          </Link>
          <button
            type="button"
            onClick={handleEndSession}
            disabled={sessionPending}
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-[family-name:var(--font-noto-georgian)] text-xs font-bold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            სესიის დახურვა
          </button>
        </div>
      </header>

      {live.error ? (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {live.error}
        </p>
      ) : null}

      <XyRoundControls
        round={selectedRound}
        currentRound={currentRound}
        votingOpen={votingOpen}
        pending={roundPending}
        maxRound={maxRound}
        onRoundChange={setSelectedRound}
        onOpen={handleOpenRound}
        onClose={handleCloseRound}
      />

      <XySubmissionProgress
        round={selectedRound}
        players={live.players}
        teams={live.teams}
        individualVotes={live.individualVotes}
        onOverride={handleOverrideIndividual}
        pendingPlayerId={pendingPlayerId}
      />

      <XyTeamPaperVotes
        round={selectedRound}
        teams={live.teams}
        teamVotes={live.teamVotes}
        pendingTeamId={pendingTeamId}
        onSetVote={handleSetTeamVote}
      />

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="mb-3 font-[family-name:var(--font-noto-georgian)] text-base font-black text-white">
          მიმდინარე ქულები
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {standings.map((standing) => (
            <div
              key={standing.team.id}
              className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5"
            >
              <p className="truncate font-[family-name:var(--font-noto-georgian)] text-sm font-bold text-slate-100">
                #{standing.team.team_number} {standing.team.name}
              </p>
              <p
                className={`font-[family-name:var(--font-jetbrains)] text-xl font-black ${
                  standing.totalPoints > 0
                    ? "text-emerald-300"
                    : standing.totalPoints < 0
                      ? "text-rose-300"
                      : "text-slate-400"
                }`}
              >
                {standing.totalPoints > 0 ? "+" : ""}
                {standing.totalPoints}
              </p>
            </div>
          ))}
        </div>
      </section>

      <XyRosterAssignment
        teams={live.teams}
        players={live.players}
        pendingPlayerId={pendingPlayerId}
        onAssign={handleAssign}
        onRenameTeam={handleRenameTeam}
        onAutoBalance={handleAutoBalance}
        autoBalancePending={balancePending}
      />
    </main>
  );
}
