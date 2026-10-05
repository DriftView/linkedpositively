import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading resource">
      <Skeleton className="mb-4 h-6 w-28 rounded-full" />
      <Skeleton className="h-72 w-full rounded-3xl" />
      <Skeleton className="mt-3 h-40 w-full rounded-3xl" />
    </div>
  );
}
