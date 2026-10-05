import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while tips load: a card and a few compact rows. */
export function TipsSkeleton({ rows = 3, card = true }: { rows?: number; card?: boolean }) {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading tips">
      {card ? (
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-7 w-3/4" />
          <div className="mt-5 space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="mt-6 flex gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
      ) : null}
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-soft">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
