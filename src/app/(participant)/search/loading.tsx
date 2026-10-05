import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy aria-label="Searching">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-13 w-full rounded-2xl" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-56 rounded-lg" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
