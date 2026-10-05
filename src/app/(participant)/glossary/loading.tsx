import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading glossary">
      <Skeleton className="h-9 w-40 rounded-xl" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full rounded-lg" />
      <Skeleton className="mt-6 h-12 w-full rounded-2xl" />
      <Skeleton className="mt-3 h-8 w-full rounded-lg" />
      <div className="mt-6 grid gap-2.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
