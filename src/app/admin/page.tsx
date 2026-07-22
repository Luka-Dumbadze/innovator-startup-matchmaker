import { Suspense } from "react";
import { headers } from "next/headers";

import {
  getActiveSessionSnapshot,
  listSessions,
} from "@/lib/actions/admin-actions";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminDashboardSkeleton } from "@/components/admin/AdminDashboardSkeleton";

export const dynamic = "force-dynamic";

async function resolvePlayUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}/play`;
}

async function AdminDashboardLoader() {
  let active = null;
  let sessions: Awaited<ReturnType<typeof listSessions>> = [];
  let loadError: string | null = null;
  const playUrl = await resolvePlayUrl();

  try {
    [active, sessions] = await Promise.all([
      getActiveSessionSnapshot(),
      listSessions(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load admin data";
  }

  return (
    <AdminDashboard
      active={active}
      sessions={sessions}
      playUrl={playUrl}
      loadError={loadError}
    />
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminDashboardSkeleton />}>
      <AdminDashboardLoader />
    </Suspense>
  );
}
