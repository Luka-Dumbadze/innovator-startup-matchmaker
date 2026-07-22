import type { Metadata } from "next";

import { HostDashboard } from "@/components/host/HostDashboard";

export const metadata: Metadata = {
  title: "Host View · Startup Matchmaker",
  description: "Big-screen live session board for the Innovation Summer School hall",
};

export default function HostPage() {
  return <HostDashboard />;
}
