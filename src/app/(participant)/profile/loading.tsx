import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your profile">
      <Skeleton className="h-32 rounded-3xl sm:h-40" />
      <div className="-mt-14 flex items-end gap-4 px-2 sm:px-5">
        <Skeleton className="size-28 rounded-full ring-4 ring-background sm:size-32" />
        <div className="flex-1 space-y-2 pb-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-44 rounded-2xl" />
    </div>
  );
}
