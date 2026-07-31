import type { Metadata, Viewport } from "next";

import { XyStudentContainer } from "@/components/xy/XyStudentContainer";

export const metadata: Metadata = {
  title: "XY Game · Win-Win Simulation",
  description: "Tap X or Y when your mentor opens the round",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

export default function XyPlayerPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12),_transparent_50%)]" />
      <XyStudentContainer />
    </main>
  );
}
