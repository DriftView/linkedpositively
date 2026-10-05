"use client";

import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { countableDays, monthOf } from "../calendar-math";
import type { TrackerCalendarDay } from "../types";
import { DayNumber, MonthCalendar, type DayState } from "./month-calendar";

/**
 * Month calendar of a personal tracker's yes/no answers (legacy /tracking
 * FullCalendar with 1.svg / 0.svg and "| X of Y").
 * `todayValue` overrides today's stored answer so a tap shows up instantly.
 */
export function TrackerCalendar({
  days,
  today,
  todayValue,
  since,
}: {
  days: TrackerCalendarDay[];
  today: string;
  todayValue: boolean | null;
  /** Local day the tracker started; earlier days don't count towards "N of M". */
  since?: string;
}) {
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => {
    const map = new Map(days.map((day) => [day.date, day.done]));
    if (todayValue === null) map.delete(today);
    else map.set(today, todayValue);
    return map;
  }, [days, today, todayValue]);

  const start = useMemo(() => {
    let first = since && since < today ? since : today;
    for (const day of byDay.keys()) if (day < first) first = day;
    return first;
  }, [byDay, today, since]);
  const minMonth = monthOf(start);

  const trackedDays = (current: string) => {
    const total = countableDays(current, today);
    if (current < minMonth) return 0;
    if (current === minMonth) return Math.max(0, total - (Number(start.slice(8, 10)) - 1));
    return total;
  };

  const cellClass = (day: string, state: DayState) => {
    const done = byDay.get(day);
    if (done === true) return "bg-success/14 hover:bg-success/22 dark:bg-success/18";
    if (done === false) return "bg-primary/8 hover:bg-primary/14 dark:bg-primary/15";
    if (state.isToday) return "border border-dashed border-primary/45 hover:bg-secondary";
    return "hover:bg-muted/70";
  };

  const renderDay = (day: string, state: DayState) => {
    const done = byDay.get(day);
    if (done === undefined) {
      return <DayNumber day={day} state={state} className={cn(!state.isToday && "text-muted-foreground")} />;
    }
    return (
      <>
        <DayNumber day={day} state={state} className="mb-[6%] text-[0.62rem] opacity-75 sm:text-[0.72rem]" />
        <span
          className={cn(
            "grid aspect-square w-[40%] place-items-center rounded-full sm:w-[30%]",
            done ? "bg-success text-success-foreground" : "bg-primary/80 text-primary-foreground",
          )}
          aria-hidden
        >
          {done ? <Check className="size-[65%]" strokeWidth={3.2} /> : <X className="size-[62%]" strokeWidth={3.2} />}
        </span>
      </>
    );
  };

  const selectedValue = byDay.get(selected);

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-soft sm:p-5">
      <MonthCalendar
        today={today}
        minMonth={minMonth}
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={setSelected}
        renderDay={renderDay}
        dayLabel={(day) => {
          const done = byDay.get(day);
          return done === undefined ? "no answer" : done ? "yes" : "no";
        }}
        dayClassName={cellClass}
        summary={(current) => {
          const answers = [...byDay.entries()].filter(([day]) => monthOf(day) === current);
          const yes = answers.filter(([, done]) => done).length;
          return (
            <span>
              <span className="font-semibold text-foreground tabular-nums">{answers.length}</span> of{" "}
              <span className="tabular-nums">{trackedDays(current)}</span> days · {yes} yes
            </span>
          );
        }}
      />
      <div className="mt-4 flex min-h-14 items-center gap-3 rounded-xl bg-muted/60 px-3.5 py-3" aria-live="polite">
        <p className="text-sm">
          <span className="font-semibold">{selected === today ? "Today" : format(parseISO(selected), "EEEE, MMMM d")}</span>
          <span className="text-muted-foreground">
            {" · "}
            {selectedValue === undefined ? (selected === today ? "Not answered yet" : "No answer") : selectedValue ? "Yes" : "No"}
          </span>
        </p>
      </div>
    </div>
  );
}
