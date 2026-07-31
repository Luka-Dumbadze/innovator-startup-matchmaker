import type { Metadata } from "next";

import { XyMentorPanel } from "@/components/xy/XyMentorPanel";
import { getXySnapshot } from "@/lib/actions/xy-actions";
import { EMPTY_XY_SNAPSHOT } from "@/lib/supabase/xy-client";
import type { XYSnapshot } from "@/types/xy";

export const metadata: Metadata = {
  title: "XY Mentor Panel · Win-Win Simulation",
  description: "Open rounds, enter team paper votes, and track submissions live",
};

export const dynamic = "force-dynamic";

export default async function XyAdminPage() {
  let snapshot: XYSnapshot = EMPTY_XY_SNAPSHOT;
  let loadError: string | null = null;

  try {
    snapshot = await getXySnapshot();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "XY მონაცემები ვერ ჩაიტვირთა";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <XyMentorPanel initial={snapshot} loadError={loadError} />
    </div>
  );
}
