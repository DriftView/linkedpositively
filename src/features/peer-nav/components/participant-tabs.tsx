"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, FolderOpen, IdCard, ListChecks, MessageCircle, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  details: IdCard,
  sessions: ListChecks,
  files: FolderOpen,
  notes: NotebookPen,
  messages: MessageCircle,
  tracker: CalendarCheck,
} as const;

export type ParticipantTab = { key: keyof typeof ICONS; label: string; count?: number; highlight?: boolean };

/** Routed tab bar for a participant (each tab has its own URL, so saves come back to it). */
export function ParticipantTabs({ participantId, tabs }: { participantId: string; tabs: ParticipantTab[] }) {
  const pathname = usePathname();
  const base = `/coach/${participantId}`;
  return (
    <nav aria-label="Participant sections" className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
      <ul className="flex min-w-max gap-0.5 border-b">
        {tabs.map((tab) => {
          const href = tab.key === "details" ? base : `${base}/${tab.key}`;
          const active = tab.key === "details" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
          const Icon = ICONS[tab.key];
          return (
            <li key={tab.key}>
              <Link
                href={href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-1.5 rounded-t-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {tab.label}
                {tab.count ? (
                  <span
                    className={cn(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-semibold tabular-nums",
                      tab.highlight ? "bg-brand-magenta text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
