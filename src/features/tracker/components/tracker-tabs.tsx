"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/tracker", label: "Daily check-in", match: (path: string) => path === "/tracker" },
  { href: "/tracker/personal", label: "My trackers", match: (path: string) => path.startsWith("/tracker/personal") },
  { href: "/tracker/reminders", label: "Reminders", match: (path: string) => path.startsWith("/tracker/reminders") },
];

/** Section switcher (legacy "Main Tracker | Personal Trackers" toggle). */
export function TrackerTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Tracker sections" className="mb-6 flex rounded-full bg-muted p-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-10 flex-1 items-center justify-center rounded-full px-2 text-[0.85rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="tracker-tab"
                className="absolute inset-0 rounded-full bg-card shadow-soft ring-1 ring-foreground/5"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            <span className="relative">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
