import Link from "next/link";
import { Crown } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "../queries";
import { RankBadge } from "./rank-badge";

const profileHref = (row: LeaderboardRow) => (row.isViewer ? "/profile" : `/people/${encodeURIComponent(row.username)}`);

/** Top three on a podium (2 · 1 · 3), then everyone else as a list. */
export function LeaderboardBoard({ rows, unit }: { rows: LeaderboardRow[]; unit: string }) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean) as LeaderboardRow[];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border bg-card px-3 pt-6 pb-0 shadow-soft">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(70%_100%_at_50%_0%,color-mix(in_oklch,var(--brand-magenta)_14%,transparent),transparent)]"
        />
        <ol className="relative grid grid-cols-3 items-end gap-2 sm:gap-4">
          {order.map((row) => {
            const first = row.rank === 1 && row === podium[0];
            const height = row === podium[0] ? "h-28 sm:h-32" : row === podium[1] ? "h-20 sm:h-24" : "h-14 sm:h-18";
            return (
              <li key={row.userId} className="flex min-w-0 flex-col items-center">
                <Link href={profileHref(row)} className="group flex min-w-0 flex-col items-center rounded-2xl px-1 pb-2">
                  <span className="relative">
                    {first ? (
                      <Crown
                        aria-hidden
                        className="absolute -top-5 left-1/2 size-5 -translate-x-1/2 fill-[oklch(0.86_0.14_85)] text-[oklch(0.72_0.15_70)]"
                      />
                    ) : null}
                    <UserAvatar
                      userId={row.userId}
                      name={row.name}
                      size={first ? "xl" : "lg"}
                      version={row.avatarVersion ?? undefined}
                      className={cn(
                        first ? "size-20 ring-4 ring-[oklch(0.86_0.14_85)]/60" : "ring-2 ring-border",
                        row.isViewer && "ring-brand-magenta/60",
                      )}
                    />
                  </span>
                  <span className="mt-2 max-w-full truncate text-sm font-semibold group-hover:underline">
                    {row.isViewer ? "You" : row.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {row.points.toLocaleString()} {unit}
                  </span>
                </Link>
                <div
                  className={cn(
                    "flex w-full items-start justify-center rounded-t-2xl pt-2.5",
                    height,
                    row === podium[0]
                      ? "bg-gradient-to-b from-brand-magenta/25 to-brand-magenta/5"
                      : "bg-gradient-to-b from-primary/15 to-primary/[0.03]",
                  )}
                >
                  <RankBadge rank={row.rank} />
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {rest.length ? (
        <ol className="divide-y divide-border/70 overflow-hidden rounded-2xl border bg-card shadow-soft" start={4}>
          {rest.map((row) => (
            <li
              key={row.userId}
              className={cn("flex items-center gap-3 px-4 py-3", row.isViewer && "bg-secondary")}
            >
              <RankBadge rank={row.rank} />
              <UserAvatar userId={row.userId} name={row.name} size="md" version={row.avatarVersion ?? undefined} />
              <div className="min-w-0 flex-1">
                <Link href={profileHref(row)} className="block truncate text-sm font-semibold hover:underline">
                  {row.isViewer ? `${row.name} (you)` : row.name}
                </Link>
                <p className="text-xs text-muted-foreground">Level {row.level}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {row.points.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
