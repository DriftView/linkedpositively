"use client";

import Link from "next/link";
import {
  AtSign,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  MessageCircle,
  MessagesSquare,
  PartyPopper,
  Sparkles,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { UserAvatar } from "@/components/app/user-avatar";
import { ReactionIcon } from "@/features/community/components/reaction-bar";
import { TimeAgo } from "@/features/community/components/content-menu";
import { REACTION_KINDS, type ReactionKind } from "@/features/community/types";
import { cn } from "@/lib/utils";
import type { NotificationDTO } from "./types";

const KIND_ICON: Partial<Record<NotificationDTO["kind"], { icon: LucideIcon; tone: string }>> = {
  post_comment: { icon: MessageCircle, tone: "bg-primary text-primary-foreground" },
  also_commented: { icon: MessagesSquare, tone: "bg-primary text-primary-foreground" },
  post_mention: { icon: AtSign, tone: "bg-brand-magenta text-white" },
  comment_mention: { icon: AtSign, tone: "bg-brand-magenta text-white" },
  level: { icon: Trophy, tone: "bg-brand-apricot/30 text-foreground" },
  welcome: { icon: PartyPopper, tone: "bg-secondary text-primary" },
  time_on_site: { icon: Sparkles, tone: "bg-secondary text-primary" },
  tracker_reminder: { icon: CalendarCheck, tone: "bg-brand-sky/25 text-foreground" },
  checkin_reminder: { icon: CalendarCheck, tone: "bg-brand-sky/25 text-foreground" },
  survey: { icon: ClipboardList, tone: "bg-brand-sky/25 text-foreground" },
  message: { icon: MessageCircle, tone: "bg-primary text-primary-foreground" },
};

function isReaction(value: string | null): value is ReactionKind {
  return Boolean(value && (REACTION_KINDS as readonly string[]).includes(value));
}

function Leading({ item }: { item: NotificationDTO }) {
  const meta = KIND_ICON[item.kind];
  if (item.actor) {
    return (
      <span className="relative shrink-0">
        <UserAvatar userId={item.actor.id} name={item.actor.name} size="md" />
        <span className="absolute -right-1 -bottom-1 grid size-5.5 place-items-center rounded-full bg-card ring-2 ring-card">
          {isReaction(item.reaction) ? (
            <ReactionIcon kind={item.reaction} className="size-4.5" />
          ) : meta ? (
            <span className={cn("grid size-5 place-items-center rounded-full", meta.tone)}>
              <meta.icon className="size-3" aria-hidden />
            </span>
          ) : null}
        </span>
      </span>
    );
  }
  if (meta && item.kind !== "welcome" && item.kind !== "time_on_site") {
    return (
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", meta.tone)}>
        <meta.icon className="size-5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
      <LogoMark className="size-7 text-primary" title="Link Positively" />
    </span>
  );
}

/**
 * One notification ("In App Message"): who/what, the message, a short
 * excerpt, time, a "Read more" link when it points somewhere, and dismiss.
 */
export function NotificationCard({
  item,
  onDismiss,
  eyebrow,
  row = false,
  className,
}: {
  item: NotificationDTO;
  onDismiss: () => void;
  eyebrow?: string;
  /** Borderless row for grouped lists (home page). */
  row?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex gap-3 pr-11 transition-shadow sm:pr-12",
        row
          ? "px-4 py-3 transition-colors hover:bg-muted/40"
          : "rounded-2xl border bg-card p-3.5 shadow-soft sm:p-4",
        !row && item.href && "hover:shadow-lift",
        !row &&
          item.isNew &&
          "border-brand-magenta/25 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--brand-magenta)_5%,var(--card)),var(--card)_55%)]",
        className,
      )}
    >
      <Leading item={item} />
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="mb-0.5 text-[0.7rem] font-bold tracking-wide text-brand-magenta uppercase">{eyebrow}</p>
        ) : null}
        <p className="text-[0.925rem] leading-snug font-medium text-foreground">
          {item.href ? (
            <Link href={item.href} className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
              {item.text}
            </Link>
          ) : (
            item.text
          )}
        </p>
        {item.excerpt ? (
          <p className="mt-1.5 line-clamp-2 border-l-2 border-border pl-2.5 text-sm text-muted-foreground">{item.excerpt}</p>
        ) : null}
        <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {item.isNew ? <span className="size-1.5 rounded-full bg-brand-magenta" aria-label="New" /> : null}
          <TimeAgo iso={item.createdAt} />
          {item.href ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
              Read more <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="absolute top-2.5 right-2.5 z-10 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
