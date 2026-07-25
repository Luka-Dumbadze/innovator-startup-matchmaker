"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, Power } from "lucide-react";

import { activateSession } from "@/lib/actions/admin-actions";
import type { DailySession } from "@/types/game";
import { SessionArchiveViewer } from "@/components/admin/SessionArchiveViewer";
import { useToast } from "@/components/admin/ToastProvider";

type SessionHistoryTableProps = {
  sessions: DailySession[];
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SessionHistoryTable({ sessions }: SessionHistoryTableProps) {
  const router = useRouter();
  const { push } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
        <History className="mx-auto mb-2 size-5 text-slate-400" />
        <p className="text-sm text-slate-500">No sessions yet — create your first one above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Session</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sessions.map((session) => {
              const isPending = pendingId === session.id;
              const isExpanded = expandedId === session.id;
              return (
                <tr key={session.id} className="transition hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {session.date_label}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {formatDate(session.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {session.is_active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((id) => (id === session.id ? null : session.id))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                          isExpanded
                            ? "border-teal-300 bg-teal-50 text-teal-800"
                            : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                        }`}
                      >
                        {isExpanded ? "Hide archive" : "View archive"}
                      </button>
                      <button
                        type="button"
                        disabled={session.is_active || isPending}
                        onClick={() => {
                          setPendingId(session.id);
                          void (async () => {
                            const result = await activateSession(session.id);
                            setPendingId(null);
                            if (!result.ok) {
                              push(result.error, "error");
                              return;
                            }
                            push(`Activated “${session.date_label}”`, "success");
                            router.refresh();
                          })();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Power className="size-3.5" />
                        )}
                        {session.is_active ? "Live" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sessions.map((session) =>
        expandedId === session.id ? (
          <SessionArchiveViewer
            key={`archive-${session.id}`}
            sessionId={session.id}
            sessionLabel={session.date_label}
            defaultOpen
          />
        ) : null
      )}
    </div>
  );
}
