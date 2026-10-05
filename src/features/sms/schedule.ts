import { createHash } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay, startOfMinute } from "date-fns";
import { dayKey, inZone } from "@/lib/dates";
import { PROGRAM_WEEKS, WELCOME_DELAY_MINUTES, weekKey } from "./program";

/**
 * When each program message goes out.
 *
 * Legacy (uy_week_count, SR:99-114): each week the cron picked a random day
 * among the first days of the week — week 1: start+1, start+1 or start+2;
 * later weeks: week start +0, +1 or +2 — and a random hour 7…21 local time.
 * It only did so in one exact cron minute, so a missed minute meant a missed
 * week. Here the same distribution is drawn from a hash of (user, cycle,
 * week), so the schedule is computed once, is reproducible, and is stored.
 */

export const FIRST_HOUR = 7;
export const LAST_HOUR = 21;

/** The participant's intervention start as a calendar day in their timezone. */
export function cycleKey(interventionStart: Date, timezone: string) {
  return dayKey(interventionStart, timezone);
}

/** Midnight of today in the timezone (what randomization stores as the start date). */
export function startOfLocalDay(now: Date, timezone: string) {
  return new Date(startOfDay(inZone(now, timezone)).getTime());
}

function draw(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  return { a: digest.readUInt32BE(0), b: digest.readUInt32BE(4) };
}

function localDate(cycle: string, offsetDays: number, hour: number, timezone: string) {
  const [year, month, day] = cycle.split("-").map(Number);
  const base = new TZDate(year, month - 1, day, 0, 0, 0, timezone);
  const target = addDays(base, offsetDays);
  return new Date(new TZDate(target.getFullYear(), target.getMonth(), target.getDate(), hour, 0, 0, timezone).getTime());
}

/** Send time of week `week` (1-based) for a participant whose program started on `cycle`. */
export function weeklySendTime(userId: string, cycle: string, week: number, timezone: string) {
  const { a, b } = draw(`${userId}:${cycle}:${weekKey(week)}`);
  const candidates = week === 1 ? [1, 1, 2] : [0, 1, 2];
  const dayOffset = (week - 1) * 7 + candidates[a % candidates.length];
  const hour = FIRST_HOUR + (b % (LAST_HOUR - FIRST_HOUR + 1));
  return localDate(cycle, dayOffset, hour, timezone);
}

/** WELCOME goes out 15 minutes after randomization (truncated to the minute). */
export function welcomeSendTime(randomizedAt: Date) {
  return new Date(startOfMinute(randomizedAt).getTime() + WELCOME_DELAY_MINUTES * 60_000);
}

export type PlannedMessage = { flag: string; week: number; scheduledFor: Date };

/** The full schedule: WELCOME (when a randomization time is known) plus weeks 1–24. */
export function planProgram(input: {
  userId: string;
  cycle: string;
  timezone: string;
  roleChangedAt?: Date | null;
}): PlannedMessage[] {
  const plan: PlannedMessage[] = [];
  if (input.roleChangedAt) plan.push({ flag: weekKey(0), week: 0, scheduledFor: new Date(input.roleChangedAt) });
  for (let week = 1; week <= PROGRAM_WEEKS; week++) {
    plan.push({ flag: weekKey(week), week, scheduledFor: weeklySendTime(input.userId, input.cycle, week, input.timezone) });
  }
  return plan;
}
