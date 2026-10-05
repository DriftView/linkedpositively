/**
 * The 27 "SMS Engagement Message Clicked" columns of the engagement report:
 * weeks 1–19, the extra "19+4 days" message, then weeks 20–26.
 */
export const SMS_WEEK_COLUMNS: { key: string; header: string; short: string }[] = [
  ...Array.from({ length: 19 }, (_, i) => ({ key: `WEEK-${i + 1}`, header: `SMS Engagement Message Clicked:Week-${i + 1}`, short: `W${i + 1}` })),
  { key: "WEEK-19+4", header: "SMS Engagement Message Clicked:Week-19+4days", short: "W19+4" },
  ...Array.from({ length: 7 }, (_, i) => ({ key: `WEEK-${i + 20}`, header: `SMS Engagement Message Clicked:Week-${i + 20}`, short: `W${i + 20}` })),
];

/**
 * Column key of a stored click flag. The old site stored "WEEK-19 4" for the
 * mid-week message (the "+" of `?sms=uid:19+4` decoded to a space); newer
 * data may say "WEEK-19+4" or "WEEK-19+FOUR".
 */
export function smsColumnKey(flag: string) {
  const normalized = flag.trim().toUpperCase();
  if (/^WEEK-19[\s+](4|FOUR)$/.test(normalized)) return "WEEK-19+4";
  const match = /^WEEK-(\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const week = Number(match[1]);
  return week >= 1 && week <= 26 ? `WEEK-${week}` : null;
}
