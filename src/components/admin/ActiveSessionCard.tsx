"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  Link2,
  QrCode,
  RotateCcw,
  Users,
  CalendarDays,
  Sparkles,
} from "lucide-react";

import { resetSessionAssignments, type ActiveSessionSnapshot } from "@/lib/actions/admin-actions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { SessionArchiveViewer } from "@/components/admin/SessionArchiveViewer";
import { useToast } from "@/components/admin/ToastProvider";

type ActiveSessionCardProps = {
  snapshot: ActiveSessionSnapshot | null;
  /** Absolute URL to `/play` (must be scannable from phones on the LAN). */
  playUrl: string;
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

export function ActiveSessionCard({ snapshot, playUrl }: ActiveSessionCardProps) {
  const router = useRouter();
  const { push } = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-200/80 text-slate-500">
          <Sparkles className="size-5" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">No active session</h3>
        <p className="mt-1 text-sm text-slate-500">
          Create a new daily session below, or activate one from history.
        </p>
      </div>
    );
  }

  const { session, teams, totalJoined } = snapshot;
  const capacity = teams.reduce((sum, t) => sum + t.max_capacity, 0);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(playUrl);
      setCopied(true);
      push("Shareable /play link copied", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push("Could not copy link — copy manually from the address bar", "error");
    }
  };

  const onReset = () => {
    startTransition(async () => {
      const result = await resetSessionAssignments(session.id);
      if (!result.ok) {
        push(result.error, "error");
        return;
      }
      setConfirmOpen(false);
      push(`Reset complete — cleared ${result.data.cleared} assignments`, "success");
      router.refresh();
    });
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                Active now
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                {session.date_label}
              </h3>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <CalendarDays className="size-3.5" />
                Created {formatDate(session.created_at)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <p className="text-xs font-medium text-slate-500">Players joined</p>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-slate-900">
                <Users className="size-4 text-teal-600" />
                {totalJoined}
                <span className="text-sm font-medium text-slate-400">/ {capacity}</span>
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <p className="text-xs font-medium text-slate-500">Teams</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {teams.length}
              </p>
            </div>
            <div className="col-span-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/80 sm:col-span-1">
              <p className="text-xs font-medium text-slate-500">Fill rate</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {capacity === 0 ? 0 : Math.round((totalJoined / capacity) * 100)}%
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                  aria-hidden
                />
                {team.name}
                <span className="tabular-nums text-slate-400">
                  {team.current_count}/{team.max_capacity}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <RotateCcw className="size-4" />
            Reset Player Assignments
          </button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 p-6 text-center text-white shadow-inner">
          <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-teal-200 uppercase">
            <QrCode className="size-3.5" />
            Student join QR
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-lg">
            <QRCodeSVG
              value={playUrl}
              size={180}
              level="M"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#0f172a"
              title="Scan to join /play"
            />
          </div>
          <p className="mt-3 max-w-[16rem] break-all text-xs text-slate-300">
            {playUrl}
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
          >
            {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy Shareable Link"}
            <Link2 className="size-3.5 opacity-60" />
          </button>
        </div>
      </div>

      <div className="mt-6">
        <SessionArchiveViewer
          sessionId={session.id}
          sessionLabel={session.date_label}
          defaultOpen
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset all player assignments?"
        description={`This clears every student from “${session.date_label}” and sets all team counts back to 0. Students will need to scan again.`}
        confirmLabel="Reset assignments"
        destructive
        busy={pending}
        onClose={() => !pending && setConfirmOpen(false)}
        onConfirm={onReset}
      />
    </>
  );
}
