import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LevelSummary } from "../queries";
import { LevelRing } from "./level-ring";

/**
 * "Your Level" (legacy uy_user_levels block): the ring, total points and how
 * far the next level is. `compact` is the profile-page variant with a link
 * to the full levels page.
 */
export function LevelCard({
  summary,
  headline,
  compact = false,
  className,
}: {
  summary: LevelSummary;
  headline?: string;
  compact?: boolean;
  className?: string;
}) {
  const nextLevel = summary.level + 1;
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border bg-card p-5 shadow-soft sm:p-6", className)}
      aria-label="Your level"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-brand-magenta/10 blur-3xl dark:bg-brand-magenta/15"
      />
      <div className="relative flex items-center gap-5">
        <LevelRing level={summary.level} progress={summary.progress} size={compact ? 96 : 116} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">You&apos;re at</p>
          <p className="font-heading text-2xl font-semibold">Level {summary.level}</p>
          <p className="mt-0.5 text-sm">
            <span className="font-semibold tabular-nums">{summary.points.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">points</span>
          </p>
          {summary.pointsThisWeek > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-apricot/25 px-2.5 py-0.5 text-xs font-semibold text-[color-mix(in_oklch,var(--brand-apricot),var(--foreground)_65%)]">
              <Flame className="size-3.5" aria-hidden /> +{summary.pointsThisWeek} this week
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative mt-5">
        {summary.maxLevel ? (
          <p className="rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground">
            You&apos;ve reached the top level. Everything is unlocked — thank you for being such an active part of the
            community!
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                <span className="tabular-nums">{summary.toNext?.toLocaleString()}</span> points to Level {nextLevel}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {summary.points.toLocaleString()} / {summary.nextLevelAt?.toLocaleString()}
              </span>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(summary.progress * 100)}
              aria-label={`Progress to Level ${nextLevel}`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-brand-magenta"
                style={{ width: `${Math.max(3, summary.progress * 100)}%` }}
              />
            </div>
            {headline ? <p className="mt-3 text-sm text-muted-foreground">{headline}</p> : null}
          </>
        )}
        {compact ? (
          <Link
            href="/levels"
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full text-sm font-medium text-primary hover:underline"
          >
            Levels, points &amp; unlocks <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
