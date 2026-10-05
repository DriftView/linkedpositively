import { Skeleton } from "@/components/ui/skeleton";

export default function LevelsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading levels">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-24 flex-1 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}
