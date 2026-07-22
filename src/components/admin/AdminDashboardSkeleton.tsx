export function AdminDashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-16 animate-pulse rounded-2xl bg-slate-200/80" />
      <div className="h-12 animate-pulse rounded-2xl bg-slate-200/60" />
      <div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200/50" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200/50" />
      </div>
    </div>
  );
}
