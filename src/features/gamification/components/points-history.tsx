"use client";

import { AnimatePresence, motion } from "motion/react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { dayKey, formatInZone, friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { loadPointHistory } from "../actions";
import type { PointHistoryItem } from "../queries";
import { ReasonIcon } from "./reason-icon";

function dayLabel(iso: string, timezone: string) {
  const key = dayKey(iso, timezone);
  if (key === dayKey(Date.now(), timezone)) return "Today";
  if (key === dayKey(Date.now() - 86_400_000, timezone)) return "Yesterday";
  return friendlyDate(iso, timezone);
}

/** Recent points, grouped by day, with "Show older points". */
export function PointsHistory({
  initial,
  nextCursor: initialCursor,
  timezone,
}: {
  initial: PointHistoryItem[];
  nextCursor: string | null;
  timezone: string;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const { executeAsync, isPending } = useAction(loadPointHistory);

  async function more() {
    if (!cursor) return;
    const result = await executeAsync({ before: cursor });
    if (!result?.data) {
      toast.error(result?.serverError ?? "Couldn't load more. Please try again.");
      return;
    }
    const page = result.data;
    setItems((current) => [...current, ...page.items]);
    setCursor(page.nextCursor);
  }

  const groups: { label: string; key: string; items: PointHistoryItem[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.at, timezone);
    const group = groups[groups.length - 1];
    if (group?.key === key) group.items.push(item);
    else groups.push({ key, label: dayLabel(item.at, timezone), items: [item] });
  }

  return (
    <div className="space-y-5">
      <AnimatePresence initial={false}>
        {groups.map((group) => {
          const total = group.items.reduce((sum, item) => sum + item.points, 0);
          return (
            <motion.section
              key={group.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              aria-label={group.label}
            >
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h3 className="font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h3>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {total >= 0 ? "+" : ""}
                  {total} pts
                </span>
              </div>
              <ul className="divide-y divide-border/70 rounded-2xl border bg-card shadow-soft">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                      <ReasonIcon reason={item.reason} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{formatInZone(item.at, "h:mm a", timezone)}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums",
                        item.points >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {item.points >= 0 ? "+" : "-"}
                      {Math.abs(item.points)}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.section>
          );
        })}
      </AnimatePresence>
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" className="h-10 rounded-full px-5" onClick={more} disabled={isPending}>
            {isPending ? <Spinner /> : null} Show older points
          </Button>
        </div>
      ) : null}
    </div>
  );
}
