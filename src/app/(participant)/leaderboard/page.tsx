import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { LeaderboardBoard } from "@/features/gamification/components/leaderboard-board";
import { getLeaderboard, getLevelSummary } from "@/features/gamification/queries";
import { can, requirePermission } from "@/server/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const viewer = await requirePermission("community.post");
  const period = (await searchParams).period === "all" ? "all" : "week";
  const earns = can(viewer, "gamification.earn");
  const [board, summary] = await Promise.all([
    getLeaderboard({ period, timezone: viewer.timezone, viewerId: viewer.id, limit: 50 }),
    earns ? getLevelSummary(viewer.id, viewer.timezone) : null,
  ]);
  const unit = "pts";
  const viewerPoints = period === "week" ? summary?.pointsThisWeek : summary?.points;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Leaderboard"
        description={period === "week" ? "Points earned since Sunday. A fresh start every week." : "Total points since you joined."}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Leaderboard period" className="inline-flex rounded-full bg-muted p-1">
          {(
            [
              ["week", "This week"],
              ["all", "All time"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={value === "week" ? "/leaderboard" : "/leaderboard?period=all"}
              aria-current={period === value ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors",
                period === value ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {earns && summary ? (
          <p className="text-sm text-muted-foreground">
            {board.viewerRow ? (
              <>
                You&apos;re <span className="font-semibold text-foreground">#{board.viewerRow.rank}</span> of{" "}
                {board.totalPeople} with{" "}
                <span className="font-semibold text-foreground tabular-nums">{viewerPoints?.toLocaleString()}</span> points
              </>
            ) : (
              "Earn a few points to join the board."
            )}
          </p>
        ) : null}
      </div>

      {board.rows.length ? (
        <LeaderboardBoard rows={board.rows} unit={unit} />
      ) : (
        <Empty className="rounded-2xl border bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trophy />
            </EmptyMedia>
            <EmptyTitle>{period === "week" ? "A fresh week" : "No points yet"}</EmptyTitle>
            <EmptyDescription>
              Nobody has earned points {period === "week" ? "this week" : "yet"}. Post on the <Link href="/">wall</Link>{" "}
              or read a <Link href="/tips">tip</Link> to take the lead.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
