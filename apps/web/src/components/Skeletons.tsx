export function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="surface-card animate-pulse p-4">
          <div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-white/10" />
          <div className="mt-3 h-7 w-28 rounded bg-slate-200 dark:bg-white/10" />
          <div className="mt-3 flex items-center justify-between">
            <div className="h-5 w-16 rounded-full bg-slate-100 dark:bg-white/5" />
            <div className="h-7 w-20 rounded bg-slate-100 dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return (
    <div className="surface-card animate-pulse p-5">
      <div className="h-4 w-40 rounded bg-slate-200 dark:bg-white/10" />
      <div className="mt-1.5 h-3 w-64 rounded bg-slate-100 dark:bg-white/5" />
      <div className={`mt-5 w-full rounded-lg bg-slate-100 dark:bg-white/5 ${height}`} />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-3.5">
          <div className="h-4 w-28 rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-4 flex-1 rounded bg-slate-100 dark:bg-white/5" />
          <div className="h-4 w-20 rounded bg-slate-100 dark:bg-white/5" />
          <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="h-4 w-24 rounded bg-slate-100 dark:bg-white/5" />
        </div>
      ))}
    </div>
  );
}
