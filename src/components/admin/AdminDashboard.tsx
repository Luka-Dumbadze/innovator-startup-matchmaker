"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  QrCode,
  History,
  AlertTriangle,
} from "lucide-react";

import type { ActiveSessionSnapshot } from "@/lib/actions/admin-actions";
import type { DailySession } from "@/types/game";
import { ActiveSessionCard } from "@/components/admin/ActiveSessionCard";
import { CreateSessionForm } from "@/components/admin/CreateSessionForm";
import { SessionHistoryTable } from "@/components/admin/SessionHistoryTable";
import { AdminSection } from "@/components/admin/ConfirmDialog";
import { ToastProvider } from "@/components/admin/ToastProvider";

type AdminDashboardProps = {
  active: ActiveSessionSnapshot | null;
  sessions: DailySession[];
  playUrl: string;
  loadError?: string | null;
};

type TabId = "active" | "create" | "history";

const TABS: { id: TabId; label: string; icon: typeof QrCode }[] = [
  { id: "active", label: "Active Session & QR", icon: QrCode },
  { id: "create", label: "Create New Session", icon: PlusCircle },
  { id: "history", label: "Past Sessions", icon: History },
];

export function AdminDashboard({
  active,
  sessions,
  playUrl,
  loadError,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<TabId>("active");

  return (
    <ToastProvider>
      <div className="relative min-h-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_#ccfbf1_0%,_transparent_45%),radial-gradient(ellipse_at_bottom_right,_#e2e8f0_0%,_transparent_40%)]"
        />

        <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
                <LayoutDashboard className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase">
                  Startup Matchmaker
                </p>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  Admin Dashboard
                </h1>
              </div>
            </div>
            <p className="hidden text-sm text-slate-500 sm:block">
              Daily sessions · words · QR join
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {loadError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Could not load dashboard data</p>
                <p className="mt-0.5 text-amber-800/90">{loadError}</p>
                <p className="mt-1 text-xs text-amber-700">
                  Ensure <code className="font-mono">.env.local</code> has{" "}
                  <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
                  <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
                  <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>, then run the
                  Phase 1 migration.
                </p>
              </div>
            </div>
          ) : null}

          <nav
            className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1.5 shadow-sm"
            aria-label="Admin sections"
          >
            {TABS.map(({ id, label, icon: Icon }) => {
              const selected = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:flex-none ${
                    selected
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  aria-current={selected ? "page" : undefined}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">
                    {id === "active" ? "Active" : id === "create" ? "Create" : "History"}
                  </span>
                </button>
              );
            })}
          </nav>

          {tab === "active" ? (
            <AdminSection
              title="Active Session & QR"
              description="Live morning session, occupancy, and the student join code."
            >
              <ActiveSessionCard snapshot={active} playUrl={playUrl} />
            </AdminSection>
          ) : null}

          {tab === "create" ? (
            <AdminSection
              title="Create New Session"
              description="Set a label, tune 8 teams (1 global challenge + 3 tools each), then go live."
            >
              <CreateSessionForm />
            </AdminSection>
          ) : null}

          {tab === "history" ? (
            <AdminSection
              title="Past Sessions History"
              description="Re-activate a previous day without recreating teams."
            >
              <SessionHistoryTable sessions={sessions} />
            </AdminSection>
          ) : null}
        </main>
      </div>
    </ToastProvider>
  );
}
