"use client";

import { useCallback, useSyncExternalStore, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2 } from "lucide-react";

type QRCodeHostCardProps = {
  playUrl?: string;
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

export function QRCodeHostCard({ playUrl: playUrlProp }: QRCodeHostCardProps) {
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
    <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-teal-500/25 bg-slate-900/60 p-5 shadow-[0_0_60px_-18px_rgba(45,212,191,0.45)] backdrop-blur-xl xl:p-7">
      <div className="mb-4 text-center font-[family-name:var(--font-noto-georgian)] text-sm font-bold leading-snug tracking-wide text-teal-200 xl:text-base">
        📱 დაასკანერეთ შეერთებისთვის
      </div>

      <div className="rounded-[1.75rem] bg-white p-4 shadow-2xl ring-4 ring-teal-400/30">
        {playUrl ? (
          <QRCodeSVG
            value={playUrl}
            size={280}
            level="H"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#020617"
            title="Join Startup Matchmaker"
            className="size-[min(36vw,260px)] max-h-[34vh] w-auto"
          />
        ) : (
          <div className="flex size-[260px] max-h-[34vh] items-center justify-center bg-slate-100 font-[family-name:var(--font-noto-georgian)] text-sm text-slate-500">
            QR მზადდება…
          </div>
        )}
      </div>

      <p className="mt-4 max-w-[18rem] break-all text-center font-mono text-xs text-slate-400 xl:text-sm">
        {playUrl || "…"}
      </p>

      <button
        type="button"
        onClick={copyLink}
        disabled={!playUrl}
        className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-800/90 px-5 py-3 font-[family-name:var(--font-noto-georgian)] text-sm font-semibold text-white ring-1 ring-slate-600 transition hover:bg-slate-700 disabled:opacity-50 xl:text-base"
      >
        {copied ? <Check className="size-5 text-emerald-400" /> : <Copy className="size-5" />}
        {copied ? "✅ დაკოპირდა" : "📋 ლინკის კოპირება"}
        <Link2 className="size-4 opacity-50" />
      </button>
    </div>
  );
}
