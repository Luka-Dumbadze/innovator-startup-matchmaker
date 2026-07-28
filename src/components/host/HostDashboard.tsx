"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Radio, AlertTriangle, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { useRealtimeHostSession } from "@/hooks/useRealtimeHostSession";
import { QRCodeHostCard } from "@/components/host/QRCodeHostCard";
import {
  LiveTimerHost,
  type PitchProjectionState,
} from "@/components/host/LiveTimerHost";
import { PitchSpotlightCard } from "@/components/host/PitchSpotlightCard";

export function HostDashboardSkeleton() {
  return (
    <div className="flex h-screen flex-col gap-4 overflow-hidden bg-slate-950 p-4 xl:p-6">
      <div className="h-14 animate-pulse rounded-2xl bg-slate-800/80" />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
        <div className="animate-pulse rounded-3xl bg-slate-800/70" />
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
          ადმინ პანელში გაააქტიურეთ დღიური სესია, რათა ამ ეკრანზე გამოჩნდეს QR კოდი და ტაიმერი.
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
  const { session, teams, totalJoined, totalCapacity, loading, error } =
    useRealtimeHostSession();
  const [projection, setProjection] = useState<PitchProjectionState>({
    active: false,
    spotlight: null,
  });

  const onProjectionChange = useCallback((state: PitchProjectionState) => {
    setProjection(state);
  }, []);

  if (loading) {
    return <HostDashboardSkeleton />;
  }

  if (!session) {
    return <HostEmptyState error={error} />;
  }

  const pitchSpotlightActive = projection.active && projection.spotlight;

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
          <h1 className="truncate font-[family-name:var(--font-noto-georgian)] text-2xl font-black tracking-tight text-white xl:text-3xl">
            ☀️ {session.date_label}
          </h1>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1.5 font-[family-name:var(--font-noto-georgian)] text-sm font-black tracking-wide text-rose-300 ring-1 ring-rose-400/50 xl:px-4 xl:text-base">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
          </span>
          🔴 პირდაპირ ეთერში
        </span>
      </header>

      <main
        className={`relative z-10 grid min-h-0 flex-1 gap-4 p-4 xl:gap-6 xl:p-6 ${
          pitchSpotlightActive ? "xl:grid-cols-[1fr_22rem]" : "xl:grid-cols-2"
        }`}
      >
        <section className="min-h-0">
          <AnimatePresence mode="wait">
            {pitchSpotlightActive && projection.spotlight ? (
              <motion.div
                key="pitch-spotlight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <PitchSpotlightCard data={projection.spotlight} />
              </motion.div>
            ) : (
              <motion.div
                key="qr-join"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <QRCodeHostCard
                  totalJoined={totalJoined}
                  totalCapacity={totalCapacity || 40}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="min-h-0">
          <LiveTimerHost
            sessionId={session.id}
            teams={teams}
            className="h-full"
            onProjectionChange={onProjectionChange}
          />
        </aside>
      </main>
    </div>
  );
}
