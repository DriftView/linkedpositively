"use client";

import Link from "next/link";
import { BellRing, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { describeWhen } from "../schedule";
import type { TrackerSummary } from "../types";
import { PointsBurst } from "./points-burst";
import { TrackerIcon, useTrackerCheckin, YesNo } from "./tracker-bits";

/** The participant's personal trackers, each with a one-tap answer for today. */
export function TrackerList({ trackers }: { trackers: TrackerSummary[] }) {
  return (
    <ul className="space-y-3">
      {trackers.map((tracker, index) => (
        <li key={tracker.id} className="animate-rise" style={{ animationDelay: `${index * 50}ms` }}>
          <TrackerRow tracker={tracker} />
        </li>
      ))}
    </ul>
  );
}

function TrackerRow({ tracker }: { tracker: TrackerSummary }) {
  const { value, answer, burst } = useTrackerCheckin(tracker.id, tracker.today);
  const week = tracker.week.map((day, index) => (index === 6 ? { ...day, done: value } : day));

  return (
    <article className="group relative rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift sm:p-5">
      <div className="flex items-start gap-3.5">
        <TrackerIcon kind={tracker.kind} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-tight font-semibold">
            <Link
              href={`/tracker/personal/${tracker.id}`}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {tracker.label}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{tracker.question}</p>
        </div>
        <ChevronRight className="mt-1 size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <WeekStrip week={week} />
        <div className="relative z-10 flex items-center gap-2">
          <div className="absolute -top-8 right-0">
            <PointsBurst points={burst.points} burstKey={burst.key} />
          </div>
          <YesNo value={value} onChange={answer} label={`${tracker.question}`} />
        </div>
      </div>

      {tracker.reminder.enabled ? (
        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <BellRing className="size-3.5" aria-hidden />
          {describeWhen(tracker.reminder)}
          {tracker.reminder.channel === "sms" ? " · text" : " · in the app"}
        </p>
      ) : null}
    </article>
  );
}

/** Last seven days as small dots with weekday initials. */
export function WeekStrip({ week }: { week: { date: string; done: boolean | null }[] }) {
  const done = week.filter((day) => day.done).length;
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Done ${done} of the last 7 days`}>
      {week.map((day, index) => (
        <span key={day.date} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "size-3.5 rounded-full transition-colors",
              day.done === true && "bg-success",
              day.done === false && "bg-primary/25 dark:bg-primary/35",
              day.done === null && "border border-dashed border-muted-foreground/40",
              index === 6 && "ring-2 ring-primary/20 ring-offset-1 ring-offset-card",
            )}
          />
          <span className="text-[0.6rem] leading-none font-medium text-muted-foreground">
            {format(parseISO(day.date), "EEEEE")}
          </span>
        </span>
      ))}
    </div>
  );
}
