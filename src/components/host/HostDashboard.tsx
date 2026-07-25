"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, AlertTriangle, ExternalLink } from "lucide-react";

import { useRealtimeHostSession } from "@/hooks/useRealtimeHostSession";
import { QRCodeHostCard } from "@/components/host/QRCodeHostCard";
import { TeamHostCard } from "@/components/host/TeamHostCard";
import { LiveTimerHost } from "@/components/host/LiveTimerHost";

export function HostDashboardSkeleton() {
  return (
    <div className="flex h-screen flex-col gap-4 overflow-hidden bg-slate-950 p-4 xl:p-6">
      <div className="h-16 animate-pulse rounded-2xl bg-slate-800/80" />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[22%_53%_25%]">
        <div className="animate-pulse rounded-3xl bg-slate-800/70" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-slate-800/60" />
          ))}
        </div>
        <div className="animate-pulse rounded-3xl bg-slate-800/70" />
      </div>
    </div>
  );
}

function HostEmptyState({ error }: { error?: string | null }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-slate-950 px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-900 ring-1 ring-slate-700">
        <Radio className="size-7 text-slate-400" />
      </div>
      <div>
        <h1 className="font-[family-name:var(--font-noto-georgian)] text-3xl font-black tracking-tight text-white">
          აქტიური სესია არ არის
        </h1>
        <p className="mt-2 max-w-md font-[family-name:var(--font-noto-georgian)] text-base text-slate-400">
          ადმინ პანელში გაააქტიურეთ დღიური სესია, რათა ამ ეკრანზე გამოჩნდეს გუნდები და QR კოდი.
        </p>
        {error ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">
            <AlertTriangle className="size-4" />
            {error}
          </p>
        ) : null}
      </div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 rounded-2xl bg-teal-500 px-5 py-3 font-[family-name:var(--font-noto-georgian)] text-base font-bold text-slate-950 transition hover:bg-teal-400"
      >
        ადმინ პანელი
        <ExternalLink className="size-4" />
      </Link>
    </div>
  );
}

export function HostDashboard() {
  const {
    session,
    teams,
    totalJoined,
    totalCapacity,
    loading,
    error,
    recentlyJoinedTeamIds,
  } = useRealtimeHostSession();

  if (loading) {
    return <HostDashboardSkeleton />;
  }

  if (!session) {
    return <HostEmptyState error={error} />;
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12)_0%,_transparent_42%),radial-gradient(ellipse_at_bottom_right,_rgba(99,102,241,0.1)_0%,_transparent_40%)]"
      />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-950/50 px-5 py-3 backdrop-blur-xl xl:px-8 xl:py-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-teal-300 uppercase xl:text-sm">
            💡 STARTUP MATCHMAKER
          </p>
          <h1 className="truncate font-[family-name:var(--font-noto-georgian)] text-2xl font-black tracking-tight text-white xl:text-4xl">
            ☀️ {session.date_label}
          </h1>
        </div>

        <div className="flex items-center gap-3 xl:gap-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1.5 font-[family-name:var(--font-noto-georgian)] text-sm font-black tracking-wide text-rose-300 ring-1 ring-rose-400/50 xl:px-4 xl:text-base">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
            </span>
            🔴 პირდაპირ ეთერში
          </span>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-2 backdrop-blur-md xl:px-5">
            <p className="flex items-center gap-2 font-[family-name:var(--font-noto-georgian)] font-mono text-xl font-black tabular-nums text-white xl:text-3xl">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={totalJoined}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  👥 {totalJoined}
                </motion.span>
              </AnimatePresence>
              <span className="text-slate-500">/ {totalCapacity || 40} მონაწილე</span>
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[22%_53%_25%] xl:gap-5 xl:p-6">
        <section className="min-h-0">
          <QRCodeHostCard />
        </section>

        <section className="grid min-h-0 grid-cols-2 content-stretch gap-3 overflow-auto xl:grid-cols-4 xl:gap-3.5">
          {teams.map((team) => (
            <TeamHostCard
              key={team.id}
              team={team}
              justJoined={recentlyJoinedTeamIds.has(team.id)}
            />
          ))}
        </section>

        <aside className="min-h-0">
          <LiveTimerHost sessionId={session.id} className="h-full" />
        </aside>
      </main>
    </div>
  );
}
