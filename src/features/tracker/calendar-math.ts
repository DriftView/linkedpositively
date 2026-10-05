import { addDays, addMonths, endOfMonth, format, getDaysInMonth, parseISO, startOfMonth } from "date-fns";

/**
 * Pure calendar helpers on local day keys ("yyyy-MM-dd") and month keys
 * ("yyyy-MM"). Client-safe; no timezone conversion happens here because the
 * keys are already local to the participant.
 */

export function monthOf(day: string) {
  return day.slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  return format(addMonths(parseISO(`${month}-01`), delta), "yyyy-MM");
}

export function shiftDay(day: string, delta: number) {
  return format(addDays(parseISO(day), delta), "yyyy-MM-dd");
}

export function monthTitle(month: string) {
  return format(parseISO(`${month}-01`), "MMMM yyyy");
}

/** Weeks (Sunday first) of a month; days outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const first = startOfMonth(parseISO(`${month}-01`));
  const last = endOfMonth(first);
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let date = first; date <= last; date = addDays(date, 1)) cells.push(format(date, "yyyy-MM-dd"));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/**
 * Days of `month` that count towards "N of M days": the whole month for past
 * months, up to today for the current month, 0 for future months.
 */
export function countableDays(month: string, today: string) {
  const current = monthOf(today);
  if (month > current) return 0;
  if (month < current) return getDaysInMonth(parseISO(`${month}-01`));
  return Number(today.slice(8, 10));
}

/**
 * Current streak (consecutive days with a check-in ending today, or ending
 * yesterday while today is still open) and the longest streak.
 */
export function streaks(checkedDays: Iterable<string>, today: string) {
  const set = new Set(checkedDays);
  let current = 0;
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  let longest = 0;
  for (const day of set) {
    if (set.has(shiftDay(day, -1))) continue; // not the start of a run
    let length = 0;
    let run = day;
    while (set.has(run)) {
      length += 1;
      run = shiftDay(run, 1);
    }
    longest = Math.max(longest, length);
  }
  return { current, longest };
}

/** The most frequent value, ties broken by the most recent. */
export function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count >= bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
