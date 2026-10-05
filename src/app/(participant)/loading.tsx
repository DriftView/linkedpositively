import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for the home wall. As the group's boundary it also covers
 * participant pages that have no loading.tsx of their own, so it stays
 * generic: a title and a few soft cards.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
