import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import type { ReminderSchedule } from "./types";

/** Reminder schedule helpers. Client-safe; everything is in the participant's timezone. */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DEFAULT_SCHEDULE: ReminderSchedule = {
  enabled: false,
  channel: "in_app",
  frequency: "daily",
  weekday: 1,
  hour: 20,
  minute: 0,
  text: null,
};

/** "8:00 PM". */
export function formatTime(hour: number, minute: number) {
  const suffix = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Every half hour of the day, for the time picker. */
export const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = (index % 2) * 30;
  return { value: `${hour}:${minute}`, hour, minute: minute as 0 | 30, label: formatTime(hour, minute) };
});

/** "Every day at 8:00 PM" / "Mondays at 9:30 AM". */
export function describeWhen(schedule: Pick<ReminderSchedule, "frequency" | "weekday" | "hour" | "minute">) {
  const time = formatTime(schedule.hour, schedule.minute);
  if (schedule.frequency === "weekly") return `${WEEKDAYS[schedule.weekday] ?? "Monday"}s at ${time}`;
  return `Every day at ${time}`;
}

export function channelLabel(channel: ReminderSchedule["channel"]) {
  return channel === "sms" ? "by text message" : "in the app";
}

/** "Every day at 8:00 PM, by text message" or "Reminders are off". */
export function describeSchedule(schedule: ReminderSchedule) {
  if (!schedule.enabled) return "Reminders are off";
  return `${describeWhen(schedule)}, ${channelLabel(schedule.channel)}`;
}

/**
 * The reminder slot (local day "yyyy-MM-dd") that is due at `now`, or null.
 *
 * A slot is due from its scheduled time until `graceMinutes` later. The job
 * runs every 15 minutes and claims each slot once, so this replaces the old
 * site's exact-minute matching (which silently skipped late cron runs) and
 * its every-minute sends (up to 60 texts in the due hour).
 *
 * With `includePreviousDay`, a slot late in the evening stays due after
 * midnight until its grace period ends.
 */
export function dueSlot(
  schedule: Pick<ReminderSchedule, "enabled" | "frequency" | "weekday" | "hour" | "minute">,
  now: Date,
  timezone: string,
  { graceMinutes = 120, includePreviousDay = true }: { graceMinutes?: number; includePreviousDay?: boolean } = {},
): string | null {
  if (!schedule.enabled) return null;
  const local = new TZDate(now.getTime(), timezone);
  const candidates = includePreviousDay ? [local, addDays(local, -1)] : [local];
  for (const candidate of candidates) {
    if (schedule.frequency === "weekly" && candidate.getDay() !== schedule.weekday) continue;
    const slot = new TZDate(
      candidate.getFullYear(),
      candidate.getMonth(),
      candidate.getDate(),
      schedule.hour,
      schedule.minute,
      0,
      timezone,
    );
    const elapsed = (now.getTime() - slot.getTime()) / 60_000;
    if (elapsed >= 0 && elapsed < graceMinutes) return format(slot, "yyyy-MM-dd");
  }
  return null;
}
