import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for a report page (tiles, chart, table). */
export function ReportSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading report">
      <Skeleton className="mb-4 h-4 w-20" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-2 mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="mb-5 h-16 w-full rounded-2xl" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[5.5rem] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mb-5 h-64 rounded-2xl" />
      <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-soft">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}
