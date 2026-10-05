import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for a participant tab. */
export function TabSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the session runner. */
export function RunnerSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-16" aria-busy="true" aria-label="Loading session">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 3 }, (_, j) => (
            <div key={j} className="flex gap-3">
              <Skeleton className="size-5 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for participant (reading-column) pages. */
export function ColumnSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}
