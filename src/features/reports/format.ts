/**
 * Pure, client-safe helpers for the study reports: legacy date formats,
 * session durations, CSV writing and week bucketing. Unit-tested in
 * format.test.ts. No server imports here.
 */
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { formatInZone, inZone } from "@/lib/dates";

/** The old server's timezone: every legacy report printed times in it. */
export const REPORT_TIMEZONE = "America/New_York";

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** PHP `m.d.Y H:i:s` (usage, interaction and tracked-items reports). */
export function legacyDateTime(date: Date | string | null | undefined, timezone = REPORT_TIMEZONE) {
  if (!date) return "";
  return formatInZone(date, "MM.dd.yyyy HH:mm:ss", timezone);
}

/** Views `m/d/Y` (study management export). */
export function legacySlashDate(date: Date | string | null | undefined, timezone = REPORT_TIMEZONE) {
  if (!date) return "";
  return formatInZone(date, "MM/dd/yyyy", timezone);
}

/** PHP `m.d.Y` (check-in report start date). */
export function legacyDotDate(date: Date | string | null | undefined, timezone = REPORT_TIMEZONE) {
  if (!date) return "";
  return formatInZone(date, "MM.dd.yyyy", timezone);
}

/** Whole days between two moments, rounded like PHP `round(diff / 86400)`. */
export function daysBetween(from: Date | string, to: Date | string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Session durations                                                   */
/* ------------------------------------------------------------------ */

/**
 * Seconds between sign-in and sign-out, or null when the session never
 * closed (no sign-out recorded) or the timestamps make no sense. The old
 * report subtracted from 1970 in that case and printed garbage.
 */
export function sessionSeconds(loginAt: Date | string, logoutAt: Date | string | null | undefined) {
  if (!logoutAt) return null;
  const seconds = Math.floor((new Date(logoutAt).getTime() - new Date(loginAt).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

export const INCOMPLETE = "Incomplete";

/**
 * "Total Session Duration" in the legacy wording ("2 hours 5 minutes 3 seconds",
 * "4 minutes 0 seconds", "12 seconds"), fixed: hours keep counting past 24
 * instead of wrapping, zero minutes/seconds no longer collapse the value to
 * seconds only, and a session without a sign-out is "Incomplete".
 */
export function legacyDuration(seconds: number | null) {
  if (seconds === null) return INCOMPLETE;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} hours ${m} minutes ${s} seconds`;
  if (m > 0) return `${m} minutes ${s} seconds`;
  return `${s} seconds`;
}

/** "1:05:09", "0:04:00" — compact duration for the screen. */
export function clockDuration(seconds: number | null) {
  if (seconds === null) return INCOMPLETE;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export type CsvCell = string | number | boolean | null | undefined;

/**
 * Text a spreadsheet would run as a formula (=, +, -, @, tab or CR first)
 * gets a leading apostrophe. Participants write the comments and posts
 * these exports carry, so opening an export must never execute anything.
 * Plain numbers ("-3", "+1.5") are left alone.
 */
export function neutralizeFormula(text: string) {
  if (!/^[=+\-@\t\r]/.test(text)) return text;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return text;
  return `'${text}`;
}

/** RFC 4180 field: quoted only when it contains a comma, quote or line break. */
export function csvField(value: CsvCell) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "boolean"
      ? value
        ? "1"
        : "0"
      : typeof value === "number"
        ? String(value)
        : neutralizeFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV the way the legacy exports were laid out (CRLF line ends, no BOM),
 * but with proper RFC 4180 quoting — the old files broke rows whenever a
 * comment contained a comma. Rows may be longer than the header (the
 * comments/ratings reports spread a list over trailing columns).
 */
export function toCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/**
 * Free text on one line, as the legacy reports did for user agents and post
 * bodies (CR, LF and commas became spaces). Kept so the column's content
 * matches what researchers' scripts expect; quoting makes it safe anyway.
 */
export function flatText(text: string | null | undefined) {
  return (text ?? "")
    .replace(/[\r\n,]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Drops markup from stored HTML (comment bodies) for plain-text exports. */
export function stripTags(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Weeks                                                               */
/* ------------------------------------------------------------------ */

/** Monday ("yyyy-MM-dd") of the calendar week a moment falls in, in `timezone`. */
export function weekKey(date: Date | string, timezone = REPORT_TIMEZONE) {
  return format(startOfWeek(inZone(date, timezone), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/** Monday of the week of a day key ("yyyy-MM-dd"), no timezone involved. */
export function weekKeyOfDay(day: string) {
  return format(startOfWeek(parseISO(day), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export type WeekBucket<K extends string> = { week: string; label: string } & Record<K, number>;

/**
 * Counts items per calendar week (Monday start), filling empty weeks between
 * the first and last so charts don't hide quiet weeks. `series` picks which
 * count an item adds to; `count` (default 1) lets SQL pre-aggregate per week. `from`/`to` (day keys) widen the range to the
 * filter's bounds when given.
 */
export function bucketByWeek<K extends string>(
  items: { week: string; series: K; count?: number }[],
  seriesKeys: readonly K[],
  bounds: { from?: string; to?: string } = {},
  maxWeeks = 104,
): WeekBucket<K>[] {
  const weeks = items.map((item) => item.week);
  if (bounds.from) weeks.push(weekKeyOfDay(bounds.from));
  if (bounds.to) weeks.push(weekKeyOfDay(bounds.to));
  if (!items.length) return [];
  const sorted = [...new Set(weeks)].sort();
  let first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Keep charts readable: show at most `maxWeeks` of the most recent weeks.
  const span = differenceInCalendarDays(parseISO(last), parseISO(first)) / 7;
  if (span >= maxWeeks) first = format(addDays(parseISO(last), -7 * (maxWeeks - 1)), "yyyy-MM-dd");

  const buckets = new Map<string, WeekBucket<K>>();
  for (let day = parseISO(first); format(day, "yyyy-MM-dd") <= last; day = addDays(day, 7)) {
    const week = format(day, "yyyy-MM-dd");
    const bucket = { week, label: format(day, "MMM d") } as WeekBucket<K>;
    for (const key of seriesKeys) (bucket as Record<string, number | string>)[key] = 0;
    buckets.set(week, bucket);
  }
  for (const item of items) {
    const bucket = buckets.get(item.week);
    if (bucket)
      (bucket as Record<string, number | string>)[item.series] = (bucket[item.series] as number) + (item.count ?? 1);
  }
  return [...buckets.values()];
}

/** Study day (1-based) of a local day key, counted from the start day key. */
export function studyDayOf(startDay: string, day: string) {
  return differenceInCalendarDays(parseISO(day), parseISO(startDay)) + 1;
}

/** Study week (1-based) of a study day; 0 before the start. */
export function studyWeekOfDay(studyDay: number) {
  return studyDay < 1 ? 0 : Math.floor((studyDay - 1) / 7) + 1;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

export function formatNumber(value: number, digits = 0) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function percent(part: number, whole: number) {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}
