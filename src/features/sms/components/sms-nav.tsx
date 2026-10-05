"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/content/sms", label: "Messages" },
  { href: "/admin/content/sms/log", label: "Send log" },
  { href: "/admin/content/sms/replies", label: "Replies" },
];

/** Section tabs for the SMS program pages. */
export function SmsNav({ unreadReplies }: { unreadReplies: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="SMS program" className="mb-6 flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.label === "Replies" && unreadReplies ? (
              <span className="rounded-full bg-brand-magenta/10 px-1.5 text-xs text-brand-magenta tabular-nums dark:bg-brand-magenta/20">{unreadReplies}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
