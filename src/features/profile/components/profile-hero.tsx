import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Profile header: a colourful banner (the old site's confetti photo banner,
 * redrawn), the picture overlapping it, name, handle and level chip.
 * `avatar` is rendered by the caller (editable on your own profile).
 */
export function ProfileHero({
  name,
  username,
  level,
  points,
  tag,
  avatar,
  actions,
  levelHref,
}: {
  name: string;
  username: string;
  level: number | null;
  points?: number | null;
  tag?: string | null;
  avatar: React.ReactNode;
  actions?: React.ReactNode;
  levelHref?: string;
}) {
  const chip =
    level !== null ? (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm">
        <Sparkles className="size-3.5" aria-hidden />
        Level {level}
        {points !== null && points !== undefined ? (
          <span className="font-normal opacity-80">· {points.toLocaleString()} pts</span>
        ) : null}
      </span>
    ) : null;

  return (
    <header className="relative">
      <div
        aria-hidden
        className="relative h-32 overflow-hidden rounded-3xl dark:brightness-[.62] dark:saturate-150 bg-gradient-to-br from-primary via-brand-magenta to-[color-mix(in_oklch,var(--brand-magenta),var(--brand-apricot)_55%)] sm:h-40"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% 78%, 0 100%)" }}
      >
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice">
          <circle cx="340" cy="20" r="70" fill="white" opacity="0.08" />
          <circle cx="60" cy="150" r="90" fill="white" opacity="0.06" />
          <g opacity="0.55">
            <rect x="250" y="40" width="8" height="14" rx="2" fill="var(--brand-apricot)" transform="rotate(25 254 47)" />
            <rect x="120" y="30" width="6" height="12" rx="2" fill="var(--brand-sky)" transform="rotate(-30 123 36)" />
            <circle cx="200" cy="70" r="4" fill="white" />
            <circle cx="300" cy="95" r="3" fill="var(--brand-pink)" />
            <circle cx="80" cy="50" r="3.5" fill="var(--brand-apricot)" />
            <rect x="360" y="90" width="7" height="12" rx="2" fill="white" transform="rotate(40 363 96)" />
            <circle cx="165" cy="115" r="2.5" fill="white" />
          </g>
        </svg>
      </div>

      <div className="relative -mt-14 flex flex-col gap-3 px-2 sm:-mt-16 sm:flex-row sm:items-end sm:gap-5 sm:px-5">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1 pb-1">
          <h1 className="truncate text-[1.7rem] leading-tight font-semibold sm:text-3xl">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">@{username}</span>
            {tag ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{tag}</span>
            ) : null}
          </div>
        </div>
        <div className={cn("flex flex-wrap items-center gap-2 pb-1")}>
          {chip && levelHref ? (
            <Link href={levelHref} className="rounded-full transition-transform hover:scale-[1.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {chip}
            </Link>
          ) : (
            chip
          )}
          {actions}
        </div>
      </div>
    </header>
  );
}
