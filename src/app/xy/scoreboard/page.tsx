import type { Metadata } from "next";

import { XyScoreboard } from "@/components/xy/XyScoreboard";

export const metadata: Metadata = {
  title: "XY Scoreboard · Win-Win Simulation",
  description: "Big-screen team scoreboard for the Win-Win simulation",
};

export default function XyScoreboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12),_transparent_55%)]" />
      <XyScoreboard />
    </main>
  );
}
