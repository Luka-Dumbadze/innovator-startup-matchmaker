import type { Metadata, Viewport } from "next";

import { PlayerContainer } from "@/components/player/PlayerContainer";

export const metadata: Metadata = {
  title: "Play · Startup Matchmaker",
  description: "Scan, get your team, and brainstorm your startup pitch",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

export default function PlayPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12),_transparent_50%)]" />
      <PlayerContainer />
    </main>
  );
}
