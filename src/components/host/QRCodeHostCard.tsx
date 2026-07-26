"use client";

import { useCallback, useSyncExternalStore, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2, Users } from "lucide-react";

type QRCodeHostCardProps = {
  playUrl?: string;
  totalJoined?: number;
  totalCapacity?: number;
};

function subscribe() {
  return () => undefined;
}

function getPlayUrlSnapshot(): string {
  return `${window.location.origin}/play`;
}

function getServerPlayUrlSnapshot(): string {
  return "";
}

export function QRCodeHostCard({
  playUrl: playUrlProp,
  totalJoined = 0,
  totalCapacity = 40,
}: QRCodeHostCardProps) {
  const [copied, setCopied] = useState(false);
  const clientPlayUrl = useSyncExternalStore(
    subscribe,
    getPlayUrlSnapshot,
    getServerPlayUrlSnapshot
  );
  const playUrl = playUrlProp ?? clientPlayUrl;

  const copyLink = useCallback(async () => {
    if (!playUrl) return;
    try {
      await navigator.clipboard.writeText(playUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore — host can read the URL under the QR.
    }
  }, [playUrl]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 rounded-3xl border border-teal-500/25 bg-slate-900/60 p-6 shadow-[0_0_60px_-18px_rgba(45,212,191,0.45)] backdrop-blur-xl xl:p-8">
      <div className="text-center font-[family-name:var(--font-noto-georgian)] text-base font-bold leading-snug tracking-wide text-teal-200 xl:text-lg">
        📱 დაასკანერეთ შეერთებისთვის
      </div>

      <div className="rounded-[2rem] bg-white p-5 shadow-2xl ring-4 ring-teal-400/35">
        {playUrl ? (
          <QRCodeSVG
            value={playUrl}
            size={420}
            level="H"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#020617"
            title="Join Startup Matchmaker"
            className="size-[min(42vw,420px)] max-h-[48vh] w-auto"
          />
        ) : (
          <div className="flex size-[min(42vw,420px)] max-h-[48vh] items-center justify-center bg-slate-100 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-500">
            QR მზადდება…
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-6 py-4 text-center backdrop-blur-md">
        <p className="mb-1 flex items-center justify-center gap-2 text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
          <Users className="size-3.5 text-teal-400" />
          მონაწილეები
        </p>
        <p className="font-mono text-4xl font-black tabular-nums text-white xl:text-5xl">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={totalJoined}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="inline-block"
            >
              {totalJoined}
            </motion.span>
          </AnimatePresence>
          <span className="text-slate-500"> / {totalCapacity || 40}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={copyLink}
        disabled={!playUrl}
        className="inline-flex items-center gap-2 rounded-2xl bg-slate-800/90 px-5 py-3 font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-white ring-1 ring-slate-600 transition hover:bg-slate-700 disabled:opacity-50 xl:text-base"
      >
        {copied ? <Check className="size-5 text-emerald-400" /> : <Copy className="size-5" />}
        {copied ? "✅ დაკოპირდა" : "📋 ლინკის კოპირება"}
        <Link2 className="size-4 opacity-50" />
      </button>
    </div>
  );
}
