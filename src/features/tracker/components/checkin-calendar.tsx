"use client";

/**
 * CheckinCalendar — month calendar of daily check-ins (meds + mood).
 *
 * Props:
 * - `days: CheckinCalendarDay[]` — from `getCheckinCalendar(userId, { from, to, timezone })`
 *   in features/tracker/queries.ts ({ date: "yyyy-MM-dd", meds: boolean|null, mood: 1–12|null }).
 * - `today: string` — "yyyy-MM-dd" in the *subject's* timezone (`dayKey(new Date(), tz)`).
 * - `defaultView?: "both" | "meds" | "mood"` — initial view (default "both"); the
 *   viewer can switch (legacy youthrive_calendar "what to show" radio).
 * - `minMonth?: "yyyy-MM"` — earliest month to navigate to. Defaults to the month of
 *   the first check-in (or the current month).
 * - `showStats?: boolean` — streak / meds / mood summary tiles (default true).
 * - `subjectName?: string` — set when someone else's calendar is shown (e.g. a
 *   peer navigator viewing a participant) to phrase empty states in 3rd person.
 * - `live?: boolean` — reflect today's answers from a DailyCheckin on the same page
 *   instantly (participant's own page only).
 *
 * Month navigation: buttons, swipe, PageUp/PageDown; arrow keys move between days.
 */

import { AnimatePresence, motion } from "motion/react";
import { Check, Flame, Pill, X } from "lucide-react";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { countableDays, monthOf, mostCommon, streaks } from "../calendar-math";
import { moodFor } from "../moods";
import type { CheckinCalendarDay } from "../types";
import { MoodFace } from "./mood-face";
import { DayNumber, MonthCalendar, type DayState } from "./month-calendar";
import { Segmented } from "./segmented";
import { useLiveToday } from "./today-store";

export type CheckinCalendarView = "both" | "meds" | "mood";

export type CheckinCalendarProps = {
  days: CheckinCalendarDay[];
  today: string;
  defaultView?: CheckinCalendarView;
  minMonth?: string;
  showStats?: boolean;
  subjectName?: string;
  live?: boolean;
  className?: string;
};

export function CheckinCalendar({
  days,
  today,
  defaultView = "both",
  minMonth,
  showStats = true,
  subjectName,
  live = false,
  className,
}: CheckinCalendarProps) {
  const [view, setView] = useState<CheckinCalendarView>(defaultView);
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const liveToday = useLiveToday(live);

  const byDay = useMemo(() => {
    const map = new Map(days.map((day) => [day.date, day]));
    if (liveToday && liveToday.day === today) {
      if (liveToday.meds === null && liveToday.mood === null) map.delete(today);
      else map.set(today, { date: today, meds: liveToday.meds, mood: liveToday.mood });
    }
    return map;
  }, [days, liveToday, today]);

  const earliest = useMemo(() => {
    let first = today;
    for (const day of byDay.keys()) if (day < first) first = day;
    return monthOf(first);
  }, [byDay, today]);
  const lowerBound = minMonth && minMonth < earliest ? minMonth : earliest;

  const counts = (candidate: CheckinCalendarDay | undefined) => {
    if (!candidate) return false;
    if (view === "meds") return candidate.meds !== null;
    if (view === "mood") return candidate.mood !== null;
    return true;
  };

  const monthEntries = [...byDay.values()].filter((day) => monthOf(day.date) === month);
  const streak = streaks(byDay.keys(), today);
  const medsAnswered = monthEntries.filter((day) => day.meds !== null);
  const medsTaken = medsAnswered.filter((day) => day.meds).length;
  const topMood = moodFor(mostCommon(monthEntries.flatMap((day) => (day.mood ? [day.mood] : []))));

  const cellClass = (day: string, state: DayState) => {
    const entry = byDay.get(day);
    const showMeds = view !== "mood" && entry?.meds !== undefined && entry?.meds !== null;
    if (showMeds && entry!.meds) return "bg-success/14 hover:bg-success/22 dark:bg-success/18";
    if (showMeds && !entry!.meds) return "bg-destructive/9 hover:bg-destructive/15 dark:bg-destructive/14";
    if (state.isToday && !counts(entry)) return "border border-dashed border-primary/45 hover:bg-secondary";
    if (entry && counts(entry)) return "bg-secondary/70 hover:bg-secondary";
    return "hover:bg-muted/70";
  };

  const renderDay = (day: string, state: DayState) => {
    const entry = byDay.get(day);
    const mood = view !== "meds" ? entry?.mood : null;
    const meds = view !== "mood" ? entry?.meds : null;
    if (!entry || (mood == null && meds == null)) {
      return <DayNumber day={day} state={state} className={cn(!state.isToday && "text-muted-foreground")} />;
    }
    return (
      <>
        <DayNumber day={day} state={state} className="mb-[6%] text-[0.62rem] opacity-75 sm:text-[0.72rem]" />
        {mood ? (
          <MoodFace mood={mood} size={40} className="h-auto w-[50%] sm:w-[40%]" />
        ) : (
          <MedsGlyph took={Boolean(meds)} className="aspect-square w-[40%] sm:w-[32%]" />
        )}
        {mood && meds === true ? (
          <Check className="absolute top-[7%] right-[7%] h-auto w-[24%] text-success sm:w-[18%]" strokeWidth={3.4} aria-hidden />
        ) : null}
        {mood && meds === false ? (
          <MedsGlyph took={false} className="absolute top-[6%] right-[6%] aspect-square w-[26%] ring-[1.5px] ring-card sm:w-[20%]" />
        ) : null}
      </>
    );
  };

  const dayLabel = (day: string) => {
    const entry = byDay.get(day);
    if (!entry) return "no check-in";
    const parts = [];
    if (entry.meds !== null) parts.push(entry.meds ? "took meds" : "missed meds");
    if (entry.mood !== null) parts.push(`felt ${moodFor(entry.mood)?.label.toLowerCase()}`);
    return parts.join(", ");
  };

  return (
    <div className={cn("space-y-5", className)}>
      {showStats ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile
            icon={<Flame className="size-4.5 text-brand-magenta" aria-hidden />}
            value={streak.current}
            unit={streak.current === 1 ? "day" : "days"}
            label="Current streak"
            hint={streak.longest > streak.current ? `Best: ${streak.longest}` : streak.current > 1 ? "Longest so far" : undefined}
          />
          <StatTile
            icon={<Pill className="size-4.5 text-success" aria-hidden />}
            value={medsTaken}
            unit={`/ ${medsAnswered.length}`}
            label="Meds taken"
            hint={format(parseISO(`${month}-01`), "MMMM")}
          />
          <StatTile
            icon={topMood ? <MoodFace mood={topMood.value} size={20} /> : null}
            value={topMood ? topMood.label : "–"}
            label="Mostly feeling"
            hint={format(parseISO(`${month}-01`), "MMMM")}
            textValue
          />
        </div>
      ) : null}

      <div className="rounded-2xl border bg-card p-3 shadow-soft sm:p-5">
        <MonthCalendar
          today={today}
          minMonth={lowerBound}
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={setSelected}
          renderDay={renderDay}
          dayLabel={dayLabel}
          dayClassName={cellClass}
          summary={(current) => {
            const checked = [...byDay.values()].filter((day) => monthOf(day.date) === current && counts(day)).length;
            const total = countableDays(current, today);
            return (
              <span>
                <span className="font-semibold text-foreground tabular-nums">{checked}</span> of{" "}
                <span className="tabular-nums">{total}</span> days checked in
              </span>
            );
          }}
          toolbar={
            <Segmented
              label="What to show"
              size="sm"
              value={view}
              onValueChange={setView}
              options={[
                { value: "both", label: "Both" },
                { value: "meds", label: "Meds" },
                { value: "mood", label: "Mood" },
              ]}
            />
          }
        />

        <DayDetail day={selected} entry={byDay.get(selected)} today={today} subjectName={subjectName} />

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3.5 text-xs text-muted-foreground">
          {view !== "mood" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <MedsGlyph took className="size-4" /> Took meds
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MedsGlyph took={false} className="size-4" /> Missed
              </span>
            </>
          ) : null}
          {view !== "meds" ? (
            <span className="inline-flex items-center gap-1.5">
              <MoodFace mood={5} size={16} /> Mood of the day
            </span>
          ) : null}
          <span className="ml-auto hidden sm:inline">Swipe or use ← → to move around</span>
        </div>
      </div>
    </div>
  );
}

function MedsGlyph({ took, className }: { took: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full",
        took ? "bg-success text-success-foreground" : "bg-destructive/85 text-white dark:bg-destructive",
        className,
      )}
      aria-hidden
    >
      {took ? <Check className="size-[65%]" strokeWidth={3.2} /> : <X className="size-[62%]" strokeWidth={3.2} />}
    </span>
  );
}

function StatTile({
  icon,
  value,
  unit,
  label,
  hint,
  textValue = false,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  label: string;
  hint?: string;
  textValue?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-soft sm:p-4">
      <div className="flex h-5 items-center">{icon}</div>
      <p className={cn("mt-2 font-heading font-semibold tracking-tight", textValue ? "truncate text-base sm:text-xl" : "text-xl sm:text-2xl")}>
        <span className="tabular-nums">{value}</span>
        {unit ? <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
        {label}
        {hint ? <span className="hidden sm:inline"> · {hint}</span> : null}
      </p>
    </div>
  );
}

function DayDetail({
  day,
  entry,
  today,
  subjectName,
}: {
  day: string;
  entry: CheckinCalendarDay | undefined;
  today: string;
  subjectName?: string;
}) {
  const mood = moodFor(entry?.mood);
  const title = day === today ? "Today" : format(parseISO(day), "EEEE, MMMM d");
  let empty = "No check-in this day.";
  if (day === today) empty = subjectName ? `${subjectName} hasn't checked in yet today.` : "You haven't checked in yet today.";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={day + JSON.stringify(entry ?? null)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="mt-4 flex min-h-16 items-center gap-3 rounded-xl bg-muted/60 px-3.5 py-3"
        aria-live="polite"
      >
        {mood ? (
          <MoodFace mood={mood.value} size={40} />
        ) : (
          <span className="grid size-10 place-items-center rounded-full bg-card text-muted-foreground">
            <span className="text-sm font-semibold tabular-nums">{Number(day.slice(8, 10))}</span>
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {entry ? (
            <p className="text-sm text-muted-foreground">
              {entry.meds === null ? "Meds not answered" : entry.meds ? "Took meds" : "Missed meds"}
              {" · "}
              {mood ? `Felt ${mood.label.toLowerCase()}` : "Mood not answered"}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{empty}</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
