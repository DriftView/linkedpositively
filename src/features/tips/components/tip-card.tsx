"use client";

/**
 * <TipCard> — one Thrive Tip, usable anywhere (Your Tips, the wall feed,
 * search results, tip page).
 *
 * Props
 * - `tip: TipCardData` (required) — build it on the server with `feedTips`,
 *   `searchTips`, `tipsHome`… from `@/features/tips/queries`. Plain JSON, safe to
 *   pass from a Server Component.
 * - `variant?: "full" | "feed" | "compact" | "page"` (default "full")
 *   - "full": the whole tip (carousel slide);
 *   - "feed": wall-feed card — eyebrow "Thrive tip", body clamped with a
 *     "Read the full tip" link, tags;
 *   - "compact": one-line-ish row linking to the tip (lists, search results);
 *   - "page": the single-tip page (bigger title, no link to itself).
 * - `showFavorite?: boolean` (default true) — heart toggle (optimistic).
 * - `className?: string`.
 *
 * Viewing points are NOT awarded by the card itself; Your Tips and the tip
 * page do that (see use-tip-view.ts), like the old site.
 */

import Link from "next/link";
import { ArrowRight, FileText, Link2, MessageCircle, PlayCircle, Sparkles, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipCardData } from "../types";
import { FavoriteButton } from "./favorite-button";
import { TipAttachments, TipVideo } from "./tip-media";

export type TipCardVariant = "full" | "feed" | "compact" | "page";

const TYPE_META = {
  html: { label: "Thrive tip", icon: Sprout },
  video: { label: "Video tip", icon: PlayCircle },
  pdf: { label: "Guide", icon: FileText },
  offsite: { label: "Worth a read", icon: Link2 },
} as const;

export function TipTypeIcon({ type, className }: { type: TipCardData["type"]; className?: string }) {
  const Icon = TYPE_META[type]?.icon ?? Sprout;
  return <Icon className={className} aria-hidden />;
}

function dayLabel(tip: TipCardData) {
  if (!tip.releasedAt) return null;
  const released = new Date(tip.releasedAt);
  const days = Math.floor((Date.now() - released.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return tip.studyDay ? `Day ${tip.studyDay}` : null;
}

function Badges({ tip, compact }: { tip: TipCardData; compact?: boolean }) {
  return (
    <>
      {tip.recommended ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-apricot/25 px-2 py-0.5 text-xs font-semibold text-[color-mix(in_oklch,var(--brand-apricot),var(--foreground)_62%)] dark:bg-brand-apricot/15 dark:text-brand-apricot">
          <Sparkles className="size-3" aria-hidden />
          {compact ? "For you" : "Recommended for you"}
        </span>
      ) : null}
      {tip.isNew ? (
        <span className="rounded-full bg-brand-magenta/10 px-2 py-0.5 text-xs font-semibold text-brand-magenta dark:bg-brand-magenta/20">New</span>
      ) : null}
    </>
  );
}

export function TipTags({ tip, limit, className }: { tip: TipCardData; limit?: number; className?: string }) {
  const tags = limit ? tip.tags.slice(0, limit) : tip.tags;
  if (!tags.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Topics">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Link
            href={`/tips/explore?tags=${encodeURIComponent(tag.slug)}`}
            className="inline-flex h-7 items-center rounded-full bg-secondary px-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            #{tag.name}
          </Link>
        </li>
      ))}
      {limit && tip.tags.length > limit ? (
        <li className="inline-flex h-7 items-center px-1 text-xs text-muted-foreground">+{tip.tags.length - limit}</li>
      ) : null}
    </ul>
  );
}

function PullQuote({ text }: { text: string }) {
  return (
    <figure className="relative my-4 rounded-xl bg-secondary/70 px-5 py-4">
      <span aria-hidden className="absolute -top-3 left-4 font-heading text-5xl leading-none text-brand-magenta/40">
        “
      </span>
      <blockquote className="font-heading text-lg leading-snug text-secondary-foreground">{text}</blockquote>
    </figure>
  );
}

function TipBody({ tip, clamp }: { tip: TipCardData; clamp?: boolean }) {
  const quoteFirst = tip.template === "text_blockquote" || tip.template === "text_linequote";
  const videoFirst = tip.template === "video_only" || tip.template === "video_text" || tip.type === "video";
  return (
    <div className="space-y-4">
      {tip.video && videoFirst ? <TipVideo video={tip.video} title={tip.title} /> : null}
      {tip.pullquote && quoteFirst ? <PullQuote text={tip.pullquote} /> : null}
      {tip.description && tip.type !== "html" ? <p className="text-[0.975rem] leading-7 text-foreground/90">{tip.description}</p> : null}
      {tip.html ? (
        <div className={cn("relative", clamp && "max-h-56 overflow-hidden")}>
          <div
            className={cn("prose-content [&>:first-child]:mt-0 [&>:last-child]:mb-0", tip.template === "text_bullet" && "[&_li]:my-1")}
            dangerouslySetInnerHTML={{ __html: tip.html }}
          />
          {clamp ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" /> : null}
        </div>
      ) : null}
      {tip.pullquote && !quoteFirst ? <PullQuote text={tip.pullquote} /> : null}
      {tip.video && !videoFirst ? <TipVideo video={tip.video} title={tip.title} /> : null}
      {!clamp ? <TipAttachments tip={tip} /> : null}
    </div>
  );
}

export function TipCard({
  tip,
  variant = "full",
  showFavorite = true,
  className,
}: {
  tip: TipCardData;
  variant?: TipCardVariant;
  showFavorite?: boolean;
  className?: string;
}) {
  const meta = TYPE_META[tip.type] ?? TYPE_META.html;
  const when = dayLabel(tip);

  if (variant === "compact") {
    return (
      <article
        className={cn(
          "group/tip relative flex items-start gap-3 rounded-2xl border bg-card p-3.5 shadow-soft transition-shadow hover:shadow-lift sm:p-4",
          tip.recommended && "border-brand-apricot/50",
          className,
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary",
            tip.recommended && "bg-brand-apricot/20 text-[color-mix(in_oklch,var(--brand-apricot),var(--foreground)_55%)] dark:text-brand-apricot",
          )}
        >
          <TipTypeIcon type={tip.type} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badges tip={tip} compact />
            {when ? <span className="text-xs text-muted-foreground">{when}</span> : null}
          </div>
          <h3 className="mt-0.5 font-heading text-[1.02rem] leading-snug font-semibold">
            <Link href={tip.href} className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
              {tip.title}
            </Link>
          </h3>
          {tip.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tip.excerpt}</p> : null}
        </div>
        {showFavorite ? <FavoriteButton tipId={tip.id} title={tip.title} favorited={tip.favorited} className="relative z-10 -mt-1 -mr-1" /> : null}
      </article>
    );
  }

  const isPage = variant === "page";
  const isFeed = variant === "feed";
  const TitleTag = isPage ? "h1" : "h2";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card shadow-soft",
        tip.recommended && "border-brand-apricot/60",
        className,
      )}
      aria-labelledby={`tip-${variant}-${tip.id}`}
    >
      {tip.recommended ? (
        <div aria-hidden className="h-1 bg-gradient-to-r from-brand-apricot via-brand-pink to-brand-magenta" />
      ) : null}
      <div className={cn("p-5", isPage && "sm:p-7")}>
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 text-primary">
                <TipTypeIcon type={tip.type} className="size-4" />
                {meta.label}
              </span>
              {when ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{when}</span>
                </>
              ) : null}
              <Badges tip={tip} />
            </div>
            <TitleTag
              id={`tip-${variant}-${tip.id}`}
              className={cn("mt-2 font-semibold text-pretty", isPage ? "text-2xl leading-tight sm:text-[1.9rem]" : "text-[1.3rem] leading-snug")}
            >
              {isFeed ? (
                <Link href={tip.href} className="rounded-sm hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  {tip.title}
                </Link>
              ) : (
                tip.title
              )}
            </TitleTag>
          </div>
          {showFavorite ? <FavoriteButton tipId={tip.id} title={tip.title} favorited={tip.favorited} className="-mt-1 -mr-2" /> : null}
        </header>

        <div className="mt-4">
          <TipBody tip={tip} clamp={isFeed} />
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <TipTags tip={tip} limit={isFeed ? 3 : undefined} />
          {isFeed ? (
            <Link
              href={tip.href}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
            >
              Read the full tip <ArrowRight className="size-4" />
            </Link>
          ) : !isPage ? (
            <Link
              href={`${tip.href}#comments`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
            >
              <MessageCircle className="size-4" /> Talk about it
            </Link>
          ) : null}
        </footer>
      </div>
    </article>
  );
}
