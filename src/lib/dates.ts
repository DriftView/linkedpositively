import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from "date-fns";

/**
 * Date helpers. The study runs on each participant's own timezone (their
 * week number, daily check-in day and SMS send times all depend on it), so
 * always pass the user's timezone rather than relying on the server's.
 */

export const DEFAULT_TIMEZONE = "America/New_York";

export function inZone(date: Date | string | number, timezone = DEFAULT_TIMEZONE) {
  return new TZDate(new Date(date).getTime(), timezone);
}

export function formatInZone(date: Date | string | number, pattern: string, timezone = DEFAULT_TIMEZONE) {
  return format(inZone(date, timezone), pattern);
}

/** "Today, 3:05 PM", "Yesterday, 9:12 AM", "Mar 4", "Mar 4, 2025". */
export function friendlyDate(date: Date | string | number, timezone = DEFAULT_TIMEZONE) {
  const zoned = inZone(date, timezone);
  const now = inZone(Date.now(), timezone);
  if (isToday(zoned) || differenceInCalendarDays(now, zoned) === 0) return `Today, ${format(zoned, "h:mm a")}`;
  if (isYesterday(zoned)) return `Yesterday, ${format(zoned, "h:mm a")}`;
  return format(zoned, isThisYear(zoned) ? "MMM d" : "MMM d, yyyy");
}

/** "5m", "3h", "2d" style relative time, falling back to a date after a week. */
export function shortAgo(date: Date | string | number, timezone = DEFAULT_TIMEZONE) {
  const value = new Date(date);
  const seconds = (Date.now() - value.getTime()) / 1000;
  if (seconds < 45) return "just now";
  if (seconds < 60 * 60 * 24 * 7) {
    return formatDistanceToNowStrict(value, { roundingMethod: "floor" })
      .replace(/ seconds?/, "s")
      .replace(/ minutes?/, "m")
      .replace(/ hours?/, "h")
      .replace(/ days?/, "d");
  }
  return friendlyDate(value, timezone);
}

/** Calendar day key ("2026-09-29") of a moment in a timezone. */
export function dayKey(date: Date | string | number, timezone = DEFAULT_TIMEZONE) {
  return format(inZone(date, timezone), "yyyy-MM-dd");
}

/**
 * Study week number (1-based) of `now` for someone whose intervention
 * started on `start`, counted in whole calendar days in their timezone.
 */
export function studyWeek(start: Date, now: Date, timezone = DEFAULT_TIMEZONE) {
  const days = differenceInCalendarDays(inZone(now, timezone), inZone(start, timezone));
  if (days < 0) return 0;
  return Math.floor(days / 7) + 1;
}

export function studyDay(start: Date, now: Date, timezone = DEFAULT_TIMEZONE) {
  return differenceInCalendarDays(inZone(now, timezone), inZone(start, timezone)) + 1;
}
