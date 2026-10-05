/** Date labels for the weekly check-in (client- and server-safe). */

/** Formats a "yyyy-MM-dd" day key (calendar date, no timezone shift) or an ISO instant. */
export function formatCheckinDate(date: string | Date, options: Intl.DateTimeFormatOptions) {
  const isDayKey = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const d = isDayKey ? new Date(`${date}T12:00:00Z`) : new Date(date);
  return d.toLocaleDateString("en-US", { ...(isDayKey ? { timeZone: "UTC" } : {}), ...options });
}

/** "Sep 7 – 13", "Sep 28 – Oct 4". */
export function weekRange(start: string, end: string) {
  const a = formatCheckinDate(start, { month: "short", day: "numeric" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const b = formatCheckinDate(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${a} – ${b}`;
}
