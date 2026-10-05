"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Bell } from "lucide-react";
import { useState } from "react";
import { NotificationCard } from "./notification-card";
import { useDismiss } from "./notification-list";
import type { NotificationDTO } from "./types";

/**
 * "In App Message" cards at the top of the home page: what arrived since
 * the notification centre was last opened (the latest three), grouped in
 * one calm card so the wall stays in view. Each can be dismissed.
 */
export function HomeMessages({ initialItems, total }: { initialItems: NotificationDTO[]; total: number }) {
  const [items, setItems] = useState(initialItems);
  const dismiss = useDismiss(setItems);
  const remaining = Math.max(items.length, total - (initialItems.length - items.length));
  if (!items.length) return null;

  return (
    <section aria-labelledby="home-messages-title" className="animate-rise overflow-hidden rounded-2xl border bg-card shadow-soft">
      <header className="flex items-center gap-2.5 border-b bg-[linear-gradient(to_right,color-mix(in_oklch,var(--brand-magenta)_7%,var(--card)),var(--card))] px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-full bg-brand-magenta/12 text-brand-magenta dark:bg-brand-magenta/20">
          <Bell className="size-3.5" aria-hidden />
        </span>
        <h2 id="home-messages-title" className="font-sans text-sm font-semibold">
          In-app messages
          <span className="ml-1.5 rounded-full bg-brand-magenta px-1.5 py-px text-[0.7rem] font-bold text-white tabular-nums">
            {remaining}
          </span>
        </h2>
        <Link
          href="/notifications"
          className="group ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-semibold text-primary hover:bg-secondary"
        >
          See all <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>
      <ul className="divide-y">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              layout
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <NotificationCard row item={{ ...item, isNew: false }} onDismiss={() => void dismiss(item, index)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
