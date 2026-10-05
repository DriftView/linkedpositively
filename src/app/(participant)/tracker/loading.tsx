import { Skeleton } from "@/components/ui/skeleton";

export default function TrackerLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your tracker">
      <div className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-6 w-24" />
        <Skeleton className="mt-6 h-5 w-64" />
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Skeleton className="h-13 rounded-full" />
          <Skeleton className="h-13 rounded-full" />
        </div>
        <Skeleton className="mt-7 h-5 w-52" />
        <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-2 py-1">
              <Skeleton className="size-12 rounded-full" />
              <Skeleton className="h-2.5 w-10" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
