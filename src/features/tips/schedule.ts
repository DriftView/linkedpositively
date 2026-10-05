import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay } from "date-fns";
import { DEFAULT_TIMEZONE, studyDay } from "@/lib/dates";

/**
 * When tips reach a participant (docs/legacy/02-checkin-and-tips.md §1.2).
 *
 * Day 1 is the intervention start date in the participant's timezone. Tips are
 * released in 90-day cycles: cycle 1 uses `displayDay`, every later cycle uses
 * `displayDayTwo` (falling back to `displayDay`). After day 90 every tip has
 * been released at least once, so the library shows everything.
 */
export const CYCLE_DAYS = 90;

export type StudyClock = {
  /** Study day, 1-based. */
  day: number;
  /** 1-based 90-day cycle. */
  cycle: number;
  /** Day within the current cycle, 1…90. */
  dayInCycle: number;
  start: Date;
  timezone: string;
};

export type ScheduledTip = { displayDay?: number | null; displayDayTwo?: number | null };

export function studyClock(start: Date | null | undefined, now: Date, timezone = DEFAULT_TIMEZONE): StudyClock | null {
  if (!start) return null;
  const day = studyDay(start, now, timezone);
  if (day < 1) return null;
  return {
    day,
    cycle: Math.floor((day - 1) / CYCLE_DAYS) + 1,
    dayInCycle: ((day - 1) % CYCLE_DAYS) + 1,
    start,
    timezone,
  };
}

/** The tip's release day inside `cycle`, or null when it isn't scheduled. */
export function tipDayInCycle(tip: ScheduledTip, cycle: number): number | null {
  const day = cycle <= 1 ? tip.displayDay : (tip.displayDayTwo ?? tip.displayDay);
  return typeof day === "number" && day >= 1 && day <= CYCLE_DAYS ? day : null;
}

/**
 * Study day of the tip's most recent release up to `clock.day`, or null when
 * it hasn't been released yet (or isn't scheduled at all).
 */
export function latestReleaseDay(tip: ScheduledTip, clock: StudyClock): number | null {
  for (let cycle = clock.cycle; cycle >= 1; cycle--) {
    const day = tipDayInCycle(tip, cycle);
    if (day == null) continue;
    const absolute = (cycle - 1) * CYCLE_DAYS + day;
    if (absolute <= clock.day) return absolute;
  }
  return null;
}

/** Midnight (participant's timezone) of a study day. */
export function studyDayStart(clock: Pick<StudyClock, "start" | "timezone">, day: number): Date {
  const start = startOfDay(new TZDate(clock.start.getTime(), clock.timezone));
  return new Date(addDays(start, day - 1).getTime());
}

/** Is this tip one of today's tips? */
export function isTodaysTip(tip: ScheduledTip, clock: StudyClock) {
  return tipDayInCycle(tip, clock.cycle) === clock.dayInCycle;
}
