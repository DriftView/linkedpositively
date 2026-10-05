import { Skeleton } from "@/components/ui/skeleton";

export default function LeaderboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading leaderboard">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-11 w-56 rounded-full" />
      <Skeleton className="h-64 rounded-3xl" />
      <Skeleton className="h-60 rounded-2xl" />
    </div>
  );
}
