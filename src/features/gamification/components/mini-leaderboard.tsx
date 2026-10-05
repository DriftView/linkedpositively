import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { cn } from "@/lib/utils";
import { getLeaderboard, type LeaderboardRow } from "../queries";
import { RankBadge } from "./rank-badge";

/**
 * "Points this week" micro-leaderboard for the home sidebar (legacy
 * `.microleaderboard` on /this_week). Shows the top five and, if they're
 * further down, the viewer's own row.
 */
export async function MiniLeaderboard({
  viewer,
  limit = 5,
  className,
}: {
  viewer: { id: string; timezone: string };
  limit?: number;
  className?: string;
}) {
  const { rows, viewerRow } = await getLeaderboard({
    period: "week",
    timezone: viewer.timezone,
    viewerId: viewer.id,
    limit,
  });
  const showViewer = viewerRow && !rows.some((row) => row.isViewer);

  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-soft", className)} aria-labelledby="mini-leaderboard-title">
      <h2 id="mini-leaderboard-title" className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Trophy className="size-4 text-brand-magenta" aria-hidden /> Points this week
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
          No points yet this week. Be the first!
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map((row) => (
            <MiniRow key={row.userId} row={row} />
          ))}
          {showViewer ? (
            <>
              <li aria-hidden className="py-0.5 text-center text-xs leading-none text-muted-foreground">
                &middot;&middot;&middot;
              </li>
              <MiniRow row={viewerRow} />
            </>
          ) : null}
        </ol>
      )}
      <Link
        href="/leaderboard"
        className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-primary transition-colors hover:bg-secondary"
      >
        View leaderboard <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

function MiniRow({ row }: { row: LeaderboardRow }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
        row.isViewer && "bg-secondary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_14%,transparent)]",
      )}
    >
      <RankBadge rank={row.rank} className="size-6 text-[0.7rem]" />
      <UserAvatar userId={row.userId} name={row.name} size="sm" version={row.avatarVersion ?? undefined} />
      <Link
        href={row.isViewer ? "/profile" : `/people/${encodeURIComponent(row.username)}`}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {row.isViewer ? "You" : row.name}
      </Link>
      <span className="text-sm font-semibold tabular-nums">
        {row.points}
        <span className="sr-only"> points</span>
      </span>
    </li>
  );
}
