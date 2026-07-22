"use client";

import { useCallback, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2, Smartphone } from "lucide-react";
import { useState } from "react";

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
    <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-slate-700/80 bg-slate-900/90 p-6 shadow-[0_0_60px_-20px_rgba(45,212,191,0.35)] xl:p-8">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold tracking-[0.2em] text-teal-300 uppercase">
        <Smartphone className="size-4" />
        Scan to join
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
            className="size-[min(40vw,280px)] max-h-[36vh] w-auto"
          />
        ) : (
          <div className="flex size-[280px] max-h-[36vh] items-center justify-center bg-slate-100 text-sm text-slate-500">
            Preparing QR…
          </div>
        )}
      </div>

      <p className="mt-5 max-w-[20rem] break-all text-center font-mono text-sm text-slate-400">
        {playUrl || "…"}
      </p>

      <button
        type="button"
        onClick={copyLink}
        disabled={!playUrl}
        className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-base font-semibold text-white ring-1 ring-slate-600 transition hover:bg-slate-700 disabled:opacity-50"
      >
        {copied ? <Check className="size-5 text-emerald-400" /> : <Copy className="size-5" />}
        {copied ? "Copied" : "Copy Direct URL"}
        <Link2 className="size-4 opacity-50" />
      </button>
    </div>
  );
}
