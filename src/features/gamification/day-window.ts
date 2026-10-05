import { TZDate } from "@date-fns/tz";
import { format, startOfDay, subDays } from "date-fns";

/**
 * The calendar day before `now` in `timezone`, as a [start, end) window plus
 * its key ("2026-09-28"). DST-safe: computed on zoned calendar days rather
 * than by subtracting 24 hours.
 */
export function previousLocalDay(now: Date, timezone: string) {
  const zonedNow = new TZDate(now.getTime(), timezone);
  const end = startOfDay(zonedNow);
  const start = subDays(end, 1);
  return {
    start: new Date(start.getTime()),
    end: new Date(end.getTime()),
    key: format(start, "yyyy-MM-dd"),
  };
}

/** A moment inside a day window to date the award (last minute of the day). */
export function awardMomentFor(window: { end: Date }) {
  return new Date(window.end.getTime() - 60_000);
}
