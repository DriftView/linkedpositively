"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Compass, Heart, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/tips", label: "Today", icon: Sun },
  { href: "/tips/explore", label: "Explore", icon: Compass },
  { href: "/tips/favorites", label: "Favourites", icon: Heart },
] as const;

/** Segmented switch between the three tip views (the old "Explore | Favorite" toggle). */
export function TipsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Tips" className="mb-6">
      <ul className="flex w-full gap-1 rounded-full bg-muted/80 p-1 sm:w-fit">
        {TABS.map((tab) => {
          const active = tab.href === "/tips" ? pathname === "/tips" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1 sm:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="tips-nav-pill"
                    className="absolute inset-0 rounded-full bg-card shadow-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <Icon className={cn("relative size-4", active && "text-primary")} aria-hidden />
                <span className="relative">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
