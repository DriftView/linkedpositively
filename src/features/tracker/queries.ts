import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { dayKey } from "@/lib/dates";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { checkinReminders, dailyCheckins, profiles, trackerEntries, trackers, type Tracker } from "@/server/db/schema";
import { shiftDay } from "./calendar-math";
import { trackerQuestion } from "./kinds";
import { DEFAULT_SCHEDULE } from "./schedule";
import type {
  CheckinCalendarDay,
  ReminderSchedule,
  TodayCheckin,
  TrackerCalendarDay,
  TrackerKind,
  TrackerSummary,
} from "./types";

/** How far back the calendars reach. */
const HISTORY_DAYS = 400;

export function toSchedule(value: Partial<ReminderSchedule> | null | undefined): ReminderSchedule {
  if (!value) return { ...DEFAULT_SCHEDULE };
  return {
    enabled: Boolean(value.enabled),
    channel: value.channel === "sms" ? "sms" : "in_app",
    frequency: value.frequency === "weekly" ? "weekly" : "daily",
    weekday: value.weekday ?? DEFAULT_SCHEDULE.weekday,
    hour: value.hour ?? DEFAULT_SCHEDULE.hour,
    minute: value.minute === 30 ? 30 : 0,
    text: value.text ?? null,
  };
}

/**
 * The daily check-in (meds + mood) of `userId` for every local day between
 * `from` and `to` (inclusive) that has an answer. Days are local to
 * `timezone`. Used by the tracker page and by Peer Navigation's coach
 * "Tracker" tab — callers must check that the viewer may see this person.
 */
export async function getCheckinCalendar(
  userId: string,
  { from, to, timezone }: { from: Date; to: Date; timezone: string },
): Promise<CheckinCalendarDay[]> {
  if (!isUuid(userId)) return [];
  const rows = await db
    .select({ day: dailyCheckins.day, meds: dailyCheckins.meds, mood: dailyCheckins.mood })
    .from(dailyCheckins)
    .where(
      and(
        eq(dailyCheckins.userId, userId),
        gte(dailyCheckins.day, dayKey(from, timezone)),
        lte(dailyCheckins.day, dayKey(to, timezone)),
      ),
    )
    .orderBy(asc(dailyCheckins.day));
  return rows
    .filter((row) => row.meds !== null || row.mood !== null)
    .map((row) => ({ date: row.day, meds: row.meds ?? null, mood: row.mood ?? null }));
}

export async function getTodayCheckin(userId: string, timezone: string): Promise<TodayCheckin> {
  const day = dayKey(new Date(), timezone);
  const [row] = await db
    .select({ meds: dailyCheckins.meds, mood: dailyCheckins.mood })
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.day, day)))
    .limit(1);
  return { day, meds: row?.meds ?? null, mood: row?.mood ?? null };
}

export async function getCheckinReminder(userId: string): Promise<ReminderSchedule> {
  const [row] = await db
    .select({ reminder: checkinReminders.reminder })
    .from(checkinReminders)
    .where(eq(checkinReminders.userId, userId))
    .limit(1);
  return toSchedule(row?.reminder);
}

/** Whether texts can reach this person (a phone number and not opted out). */
export async function getSmsStatus(userId: string): Promise<{ hasPhone: boolean; optedOut: boolean }> {
  const [profile] = await db
    .select({ phone: profiles.phone, smsOptOut: profiles.smsOptOut })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return { hasPhone: Boolean(profile?.phone), optedOut: Boolean(profile?.smsOptOut) };
}

/** Everything the daily check-in page needs. */
export async function getCheckinOverview(userId: string, timezone: string) {
  const now = new Date();
  const [today, days, reminder, sms] = await Promise.all([
    getTodayCheckin(userId, timezone),
    getCheckinCalendar(userId, { from: new Date(now.getTime() - HISTORY_DAYS * 86_400_000), to: now, timezone }),
    getCheckinReminder(userId),
    getSmsStatus(userId),
  ]);
  return { today, days, reminder, sms };
}

type TrackerRow = Pick<Tracker, "id" | "kind" | "label" | "reminder" | "createdAt">;

const TRACKER_FIELDS = {
  id: trackers.id,
  kind: trackers.kind,
  label: trackers.label,
  reminder: trackers.reminder,
  createdAt: trackers.createdAt,
};

function toSummary(tracker: TrackerRow, answers: Map<string, boolean>, today: string): TrackerSummary {
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(today, index - 6);
    return { date, done: answers.has(date) ? answers.get(date)! : null };
  });
  return {
    id: tracker.id,
    kind: tracker.kind as TrackerKind,
    label: tracker.label,
    question: trackerQuestion(tracker.kind as TrackerKind, tracker.label),
    reminder: toSchedule(tracker.reminder),
    createdAt: tracker.createdAt.toISOString(),
    today: answers.has(today) ? answers.get(today)! : null,
    week,
  };
}

/** The viewer's active personal trackers with today's answer and the last week. */
export async function listTrackers(userId: string, timezone: string): Promise<TrackerSummary[]> {
  const today = dayKey(new Date(), timezone);
  const rows = await db
    .select(TRACKER_FIELDS)
    .from(trackers)
    .where(and(eq(trackers.userId, userId), isNull(trackers.deletedAt)))
    .orderBy(asc(trackers.createdAt), asc(trackers.id));
  if (!rows.length) return [];
  const entries = await db
    .select({ trackerId: trackerEntries.trackerId, day: trackerEntries.day, done: trackerEntries.done })
    .from(trackerEntries)
    .where(
      and(
        inArray(
          trackerEntries.trackerId,
          rows.map((tracker) => tracker.id),
        ),
        gte(trackerEntries.day, shiftDay(today, -6)),
        lte(trackerEntries.day, today),
      ),
    );
  const byTracker = new Map<string, Map<string, boolean>>();
  for (const entry of entries) {
    const key = entry.trackerId;
    if (!byTracker.has(key)) byTracker.set(key, new Map());
    byTracker.get(key)!.set(entry.day, entry.done);
  }
  return rows.map((tracker) => toSummary(tracker, byTracker.get(tracker.id) ?? new Map(), today));
}

/** One of the viewer's own trackers with its full calendar, or null (also for other people's trackers). */
export async function getTracker(userId: string, trackerId: string, timezone: string) {
  if (!isUuid(trackerId) || !isUuid(userId)) return null;
  const [tracker] = await db
    .select(TRACKER_FIELDS)
    .from(trackers)
    .where(and(eq(trackers.id, trackerId), eq(trackers.userId, userId), isNull(trackers.deletedAt)))
    .limit(1);
  if (!tracker) return null;
  const today = dayKey(new Date(), timezone);
  const entries = await db
    .select({ day: trackerEntries.day, done: trackerEntries.done })
    .from(trackerEntries)
    .where(and(eq(trackerEntries.trackerId, tracker.id), gte(trackerEntries.day, shiftDay(today, -HISTORY_DAYS))))
    .orderBy(asc(trackerEntries.day));
  const answers = new Map(entries.map((entry) => [entry.day, entry.done]));
  const days: TrackerCalendarDay[] = entries.map((entry) => ({ date: entry.day, done: entry.done }));
  const since = dayKey(tracker.createdAt, timezone);
  return { tracker: toSummary(tracker, answers, today), days, today, since };
}
