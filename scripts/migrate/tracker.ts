import { isNotNull } from "drizzle-orm";
import { checkinReminders, trackerEntries, trackers, type ReminderScheduleJson, type TrackerKind } from "@/server/db/schema";
import { q, type Ctx } from "./lib/context";
import { dayOf, str, ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { tzOf, userMap } from "./lib/user-map";

/**
 * Personal trackers (ts_tracking + the per-user time in ts_tracking_time),
 * their daily answers (ts_tracking_data) and the daily check-in reminder
 * settings (reminder_checkin_time). ts_tracking_bkp is an old backup copy.
 */

const TERM_KIND: Record<number, TrackerKind> = { 296: "hormones", 297: "prep", 298: "sex" };
const TERM_LABEL: Record<number, string> = { 296: "Hormones", 297: "PrEP", 298: "Sex" };

function clampHour(value: unknown, fallback = 20) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}
function weekday(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 1;
}

export async function migrateTracker(ctx: Ctx) {
  const map = await userMap(ctx);

  // ---- trackers ----
  const times = await q<{ uid: number; hour: number; minute: number }>(ctx.lp, "select uid, hour, minute from ts_tracking_time order by id");
  const timeOf = new Map(times.map((t) => [Number(t.uid), t])); // last row per user wins (merge key uid)
  const rows = await q<{
    id: number;
    uid: number;
    tid: number;
    text: string;
    how_often: number;
    day: number | null;
    reminders: number;
    noti_text: string;
    flag: number;
    created: number;
  }>(ctx.lp, "select id, uid, tid, text, how_often, day, reminders, noti_text, flag, created from ts_tracking order by id");
  ctx.stats.source("trackers", rows.length);
  const out = [];
  for (const row of rows) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("trackers", "user not migrated (deleted account)");
      continue;
    }
    const tid = Number(row.tid);
    const time = timeOf.get(Number(row.uid));
    const reminder: ReminderScheduleJson = {
      enabled: Number(row.flag) === 1,
      channel: Number(row.reminders) === 0 ? "sms" : "in_app",
      frequency: Number(row.how_often) === 1 ? "weekly" : "daily",
      weekday: weekday(row.day),
      hour: clampHour(time?.hour),
      minute: Number(time?.minute) === 1 ? 30 : 0,
      ...(str(row.noti_text) ? { text: str(row.noti_text)! } : {}),
    };
    out.push({
      userId,
      kind: TERM_KIND[tid] ?? ("custom" as const),
      label: (str(row.text) ?? TERM_LABEL[tid] ?? "Tracker").trim(),
      legacyTermId: tid,
      reminder,
      extra: time ? null : { noReminderTime: true },
      ...legacy("lp", "ts_tracking", row.id),
      createdAt: ts(row.created) ?? new Date(0),
      updatedAt: ts(row.created) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "trackers", trackers, out);
  const trackerIds = new Map(
    (await ctx.db.select({ id: trackers.id, legacyId: trackers.legacyId, userId: trackers.userId }).from(trackers).where(isNotNull(trackers.legacyId))).map(
      (t) => [t.legacyId!, t],
    ),
  );

  // ---- tracker answers (one per tracker and local day; the newest row wins) ----
  const data = await q<{ id: number; uid: number; tid: number; checkin: number | null; created: number }>(
    ctx.lp,
    "select id, uid, tid, checkin, created from ts_tracking_data order by id desc",
  );
  ctx.stats.source("tracker_entries", data.length);
  const entries = new Map<string, Record<string, unknown>>();
  for (const row of data) {
    const tracker = trackerIds.get(Number(row.tid));
    if (!tracker) {
      ctx.stats.skip(
        "tracker_entries",
        map.lp.get(Number(row.uid)) ? "tracker not migrated" : "user not migrated (deleted account)",
      );
      continue;
    }
    if (row.checkin === null) {
      ctx.stats.skip("tracker_entries", "no answer");
      continue;
    }
    const day = dayOf(row.created, tzOf(map, tracker.userId));
    const key = `${tracker.id}:${day}`;
    if (!day || entries.has(key)) {
      ctx.stats.skip("tracker_entries", "second answer for the same tracker and day (older one dropped)");
      continue;
    }
    entries.set(key, {
      userId: tracker.userId,
      trackerId: tracker.id,
      day,
      done: Number(row.checkin) === 1,
      ...legacy("lp", "ts_tracking_data", row.id),
      createdAt: ts(row.created) ?? new Date(0),
      updatedAt: ts(row.created) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "tracker_entries", trackerEntries, [...entries.values()], { target: [trackerEntries.trackerId, trackerEntries.day] });

  // ---- daily check-in reminder settings ----
  const reminders = await q<{ id: number; uid: number; reminders: number; how_often: number; day: number | null; hour: number; created: number }>(
    ctx.lp,
    "select id, uid, reminders, how_often, day, hour, created from reminder_checkin_time order by id desc",
  );
  ctx.stats.source("checkin_reminders", reminders.length);
  const byUser = new Map<string, Record<string, unknown>>();
  for (const row of reminders) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("checkin_reminders", "user not migrated (deleted account)");
      continue;
    }
    if (byUser.has(userId)) {
      ctx.stats.skip("checkin_reminders", "older settings row for the same user");
      continue;
    }
    byUser.set(userId, {
      userId,
      reminder: {
        enabled: true,
        channel: Number(row.reminders) === 0 ? "sms" : "in_app",
        frequency: Number(row.how_often) === 1 ? "weekly" : "daily",
        weekday: weekday(row.day),
        hour: clampHour(row.hour),
        minute: 0,
      } satisfies ReminderScheduleJson,
      ...legacy("lp", "reminder_checkin_time", row.id),
      createdAt: ts(row.created) ?? new Date(0),
      updatedAt: ts(row.created) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "checkin_reminders", checkinReminders, [...byUser.values()], { target: [checkinReminders.userId] });
  const backup = await q<{ n: number }>(ctx.lp, "select count(*) n from ts_tracking_bkp");
  ctx.stats.source("ts_tracking_bkp", Number(backup[0]?.n ?? 0));
  ctx.stats.skip("ts_tracking_bkp", "old backup copy of ts_tracking (not live data)", Number(backup[0]?.n ?? 0));
}
