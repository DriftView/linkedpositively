import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading resources">
      <Skeleton className="h-9 w-44 rounded-xl" />
      <Skeleton className="mt-3 h-5 w-72 rounded-lg" />
      <Skeleton className="mt-6 h-11 w-40 rounded-full" />
      <Skeleton className="mt-4 h-40 w-full rounded-3xl" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
