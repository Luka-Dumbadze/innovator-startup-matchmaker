"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { teamIdeasChannelName } from "@/lib/utils/player-storage";
import type { IdeaNotes, SharedTeamIdea } from "@/types/game";

type TeamIdeaHubProps = {
  sessionId: string;
  teamId: string;
  playerUid: string;
  nickname: string;
  localNotes: IdeaNotes;
  /** When true (team_brainstorm), broadcast & listen. */
  active: boolean;
  onUseAsFoundation: (idea: IdeaNotes) => void;
};

type IdeaSharePayload = SharedTeamIdea;

export function TeamIdeaHub({
  sessionId,
  teamId,
  playerUid,
  nickname,
  localNotes,
  active,
  onUseAsFoundation,
}: TeamIdeaHubProps) {
  const [ideas, setIdeas] = useState<Record<string, SharedTeamIdea>>({});
  const [index, setIndex] = useState(0);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createBrowserSupabaseClient>["channel"]
  > | null>(null);
  const notesRef = useRef(localNotes);
  const nicknameRef = useRef(nickname);

  notesRef.current = localNotes;
  nicknameRef.current = nickname;

  const ideaList = useMemo(() => Object.values(ideas), [ideas]);
  const current = ideaList[index] ?? null;

  const upsertIdea = useCallback((idea: SharedTeamIdea) => {
    setIdeas((prev) => ({ ...prev, [idea.playerUid]: idea }));
  }, []);

  const broadcastOwn = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !active) return;

    const notes = notesRef.current;
    const payload: IdeaSharePayload = {
      playerUid,
      nickname: nicknameRef.current,
      startupName: notes.startupName,
      oneSentenceSolution: notes.oneSentenceSolution,
      toolsIntegration: notes.toolsIntegration,
      updatedAt: new Date().toISOString(),
    };

    upsertIdea(payload);
    void channel.send({
      type: "broadcast",
      event: "IDEA_SHARE",
      payload,
    });
  }, [active, playerUid, upsertIdea]);

  useEffect(() => {
    if (!active) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(teamIdeasChannelName(sessionId, teamId), {
      config: { broadcast: { self: true } },
    });

    channel
      .on("broadcast", { event: "IDEA_SHARE" }, ({ payload }) => {
        const data = payload as IdeaSharePayload;
        if (!data?.playerUid || !data.nickname) return;
        upsertIdea({
          playerUid: data.playerUid,
          nickname: data.nickname,
          startupName: data.startupName ?? "",
          oneSentenceSolution: data.oneSentenceSolution ?? "",
          toolsIntegration: data.toolsIntegration ?? "",
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        });
      })
      .on("broadcast", { event: "IDEA_REQUEST" }, () => {
        broadcastOwn();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          broadcastOwn();
          void channel.send({ type: "broadcast", event: "IDEA_REQUEST", payload: {} });
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [active, sessionId, teamId, broadcastOwn, upsertIdea]);

  // Debounced re-broadcast when local notes change during team phase
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => broadcastOwn(), 450);
    return () => window.clearTimeout(t);
  }, [active, localNotes, broadcastOwn]);
  useEffect(() => {
    if (index >= ideaList.length) {
      setIndex(Math.max(0, ideaList.length - 1));
    }
  }, [ideaList.length, index]);

  if (!active) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-teal-500/30 bg-teal-950/40 p-4 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-teal-300 uppercase">
            Team Idea Hub
          </p>
          <h2 className="text-base font-black text-white">
            {ideaList.length} teammate idea{ideaList.length === 1 ? "" : "s"}
          </h2>
        </div>
        {ideaList.length > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous idea"
              onClick={() => setIndex((i) => (i - 1 + ideaList.length) % ideaList.length)}
              className="rounded-lg bg-slate-900 p-2 text-slate-300 ring-1 ring-slate-700"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next idea"
              onClick={() => setIndex((i) => (i + 1) % ideaList.length)}
              className="rounded-lg bg-slate-900 p-2 text-slate-300 ring-1 ring-slate-700"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {ideaList.length === 0 ? (
        <p className="rounded-xl bg-slate-950/60 px-3 py-4 text-center text-sm text-slate-400">
          Waiting for teammates to share drafts…
        </p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.playerUid ?? "empty"}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4"
          >
            <p className="mb-3 text-sm font-bold text-teal-200">
              🤖 {current?.nickname}&apos;s Idea
              {current?.playerUid === playerUid ? (
                <span className="ml-2 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                  You
                </span>
              ) : null}
            </p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                  Startup
                </dt>
                <dd className="font-semibold text-white">
                  {current?.startupName.trim() || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                  1-sentence solution
                </dt>
                <dd className="text-slate-200">
                  {current?.oneSentenceSolution.trim() || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                  Tools integration
                </dt>
                <dd className="font-[family-name:var(--font-noto-georgian)] text-slate-200">
                  {current?.toolsIntegration.trim() || "—"}
                </dd>
              </div>
            </dl>

            {current && current.playerUid !== playerUid ? (
              <button
                type="button"
                onClick={() =>
                  onUseAsFoundation({
                    startupName: current.startupName,
                    oneSentenceSolution: current.oneSentenceSolution,
                    toolsIntegration: current.toolsIntegration,
                  })
                }
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
              >
                <Star className="size-4" />
                Use as Team Foundation
              </button>
            ) : null}

            {ideaList.length > 1 ? (
              <p className="mt-3 text-center text-[10px] font-semibold tracking-wide text-slate-500">
                {index + 1} / {ideaList.length}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.section>
  );
}
