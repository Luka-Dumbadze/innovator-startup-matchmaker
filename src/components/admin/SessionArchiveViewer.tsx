"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ChevronDown,
  Download,
  FileJson,
  Loader2,
  Archive,
  Star,
  Users,
} from "lucide-react";

import {
  exportSessionCSV,
  getFullSessionArchive,
  type FullSessionArchive,
  type SessionArchiveTeam,
} from "@/lib/actions/admin-actions";
import { TOOL_SLOT_META } from "@/lib/constants/preset-words";
import { useToast } from "@/components/admin/ToastProvider";

type SessionArchiveViewerProps = {
  sessionId: string;
  sessionLabel: string;
  /** Start expanded (e.g. active session). */
  defaultOpen?: boolean;
};

function downloadBlob(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(label: string): string {
  return label
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 64) || "session";
}

function formatStamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function TeamArchivePanel({ team }: { team: SessionArchiveTeam }) {
  const drafts = team.ideas.filter((i) => !i.is_final_team_pitch);
  const finals = team.ideas.filter((i) => i.is_final_team_pitch);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="size-3 rounded-full ring-2 ring-white"
            style={{ backgroundColor: team.color }}
          />
          <h4 className="text-sm font-bold text-slate-900">
            Team {team.team_number} · {team.name}
          </h4>
          <span className="text-xs tabular-nums text-slate-400">
            {team.current_count}/{team.max_capacity}
          </span>
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200/80">
        <p className="text-[10px] font-bold tracking-wide text-amber-800 uppercase">
          🌍 Global Challenge
        </p>
        <p className="font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-amber-950">
          {team.domain || "—"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {TOOL_SLOT_META.map((slot, index) => (
          <div
            key={slot.label}
            className="rounded-lg bg-slate-50 px-2 py-2 text-center ring-1 ring-slate-200"
          >
            <p className="text-xs leading-none" aria-hidden>
              {slot.icon}
            </p>
            <p className="mt-1 truncate font-[family-name:var(--font-noto-georgian)] text-[11px] font-semibold text-slate-800">
              {team.words[index] ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
          <Users className="size-3.5" />
          Roster ({team.assignments.length})
        </p>
        {team.assignments.length === 0 ? (
          <p className="text-xs text-slate-400">No students assigned yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {team.assignments.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {member.real_name || "—"}
                </span>
                <span className="text-xs font-semibold text-teal-700">
                  @{member.nickname || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
          📝 Submitted ideas
        </p>
        {finals.length > 0 ? (
          <div className="mb-2 space-y-2">
            {finals.map((idea) => (
              <article
                key={idea.id}
                className="rounded-lg border border-amber-300 bg-amber-50/80 p-3"
              >
                <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-black tracking-wide text-amber-800 uppercase">
                  <Star className="size-3" />
                  Final team pitch
                </p>
                <p className="text-sm font-bold text-slate-900">{idea.startup_name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {idea.one_sentence_solution}
                </p>
                <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-xs text-slate-500">
                  {idea.tools_integration}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  by {idea.author_real_name || "—"} (@{idea.author_nickname}) ·{" "}
                  {formatStamp(idea.created_at)}
                </p>
                {idea.is_final_team_pitch ? (
                  <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-800">
                      👍 {idea.likes_count}
                    </span>
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-800">
                      👎 {idea.dislikes_count}
                    </span>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {drafts.length === 0 && finals.length === 0 ? (
          <p className="text-xs text-slate-400">No submissions yet.</p>
        ) : null}

        {drafts.length > 0 ? (
          <ul className="space-y-2">
            {drafts.map((idea) => (
              <li
                key={idea.id}
                className="rounded-lg border border-slate-200 bg-slate-50/80 p-3"
              >
                <p className="text-sm font-semibold text-slate-900">{idea.startup_name}</p>
                <p className="mt-1 text-xs text-slate-600">{idea.one_sentence_solution}</p>
                <p className="mt-1 font-[family-name:var(--font-noto-georgian)] text-xs text-slate-500">
                  {idea.tools_integration}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  {idea.author_real_name || "—"} (@{idea.author_nickname}) ·{" "}
                  {formatStamp(idea.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function SessionArchiveViewer({
  sessionId,
  sessionLabel,
  defaultOpen = false,
}: SessionArchiveViewerProps) {
  const { push } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [archive, setArchive] = useState<FullSessionArchive | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [loadPending, startLoad] = useTransition();
  const [exportPending, startExport] = useTransition();

  const loadArchive = useCallback(() => {
    startLoad(async () => {
      const result = await getFullSessionArchive(sessionId);
      if (!result.ok) {
        push(result.error, "error");
        return;
      }
      setArchive(result.data);
      setActiveTeamId((prev) => prev ?? result.data.teams[0]?.id ?? null);
    });
  }, [sessionId, push]);

  useEffect(() => {
    if (!defaultOpen) return;
    loadArchive();
  }, [defaultOpen, loadArchive]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && !archive) {
        loadArchive();
      }
      return next;
    });
  };
  const onExportCsv = () => {
    startExport(async () => {
      const result = await exportSessionCSV(sessionId);
      if (!result.ok) {
        push(result.error, "error");
        return;
      }
      downloadBlob(
        `${safeFilename(sessionLabel)}_archive.csv`,
        result.data,
        "text/csv;charset=utf-8"
      );
      push("CSV downloaded", "success");
    });
  };

  const onExportJson = () => {
    startExport(async () => {
      let data = archive;
      if (!data) {
        const result = await getFullSessionArchive(sessionId);
        if (!result.ok) {
          push(result.error, "error");
          return;
        }
        data = result.data;
        setArchive(data);
      }
      downloadBlob(
        `${safeFilename(sessionLabel)}_archive.json`,
        JSON.stringify(data, null, 2),
        "application/json"
      );
      push("JSON downloaded", "success");
    });
  };

  const activeTeam =
    archive?.teams.find((t) => t.id === activeTeamId) ?? archive?.teams[0] ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <button
          type="button"
          onClick={toggleOpen}
          className="inline-flex flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50 sm:flex-none"
          aria-expanded={open}
        >
          <Archive className="size-4 text-teal-700" />
          Session archive
          <ChevronDown
            className={`ml-1 size-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          />
        </button>

        <button
          type="button"
          onClick={onExportCsv}
          disabled={exportPending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
        >
          {exportPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          📥 Export CSV
        </button>
        <button
          type="button"
          onClick={onExportJson}
          disabled={exportPending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
        >
          {exportPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileJson className="size-3.5" />
          )}
          📄 Export JSON
        </button>
      </div>

      {open ? (
        <div className="border-t border-slate-200 px-3 pb-4 sm:px-4">
          {loadPending && !archive ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading archive…
            </div>
          ) : null}

          {archive ? (
            <div className="space-y-3 pt-3">
              <p className="text-xs text-slate-500">
                {archive.teams.reduce((n, t) => n + t.assignments.length, 0)} players ·{" "}
                {archive.teams.reduce((n, t) => n + t.ideas.length, 0)} submissions
              </p>

              <div className="flex flex-wrap gap-1.5">
                {archive.teams.map((team) => {
                  const selected = team.id === activeTeam?.id;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setActiveTeamId(team.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      T{team.team_number}
                    </button>
                  );
                })}
              </div>

              {activeTeam ? <TeamArchivePanel team={activeTeam} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
