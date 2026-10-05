"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** "Find | Saved" segmented control (the old site's segmented toggles). */
export function ResourcesTabs({ savedCount }: { savedCount: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/resources", label: "Find" },
    { href: "/resources/saved", label: "Saved", count: savedCount },
  ];
  return (
    <nav aria-label="Resources" className="inline-flex rounded-full bg-muted/70 p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="resources-tab"
                className="absolute inset-0 rounded-full bg-card shadow-soft"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            <span className="relative">{tab.label}</span>
            {tab.count ? (
              <span className="relative rounded-full bg-brand-magenta/12 px-1.5 text-xs font-semibold text-brand-magenta tabular-nums">
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
