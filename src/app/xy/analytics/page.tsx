import type { Metadata } from "next";

import { XyAnalyticsDashboard } from "@/components/xy/XyAnalyticsDashboard";
import { XY_UI_SUBTITLE, XY_UI_TITLE } from "@/lib/xy/session-state";

export const metadata: Metadata = {
  title: `${XY_UI_TITLE} · Analytics`,
  description: XY_UI_SUBTITLE,
};

export default function XyAnalyticsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <XyAnalyticsDashboard />
    </main>
  );
}
