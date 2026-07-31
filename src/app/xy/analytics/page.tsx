import type { Metadata } from "next";

import { XyAnalyticsDashboard } from "@/components/xy/XyAnalyticsDashboard";

export const metadata: Metadata = {
  title: "XY Analytics · Win-Win Simulation",
  description: "Round-by-round individual phone votes vs team paper decisions",
};

export default function XyAnalyticsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <XyAnalyticsDashboard />
    </main>
  );
}
