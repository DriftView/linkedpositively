"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { award } from "@/features/gamification/points";
import { retractNotifications } from "@/features/notifications/notify";
import { dayKey } from "@/lib/dates";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import {
  checkinReminders,
  dailyCheckins,
  notifications,
  trackerEntries,
  trackers,
  type ReminderScheduleJson,
} from "@/server/db/schema";
import { logger } from "@/server/logger";
import { MAX_ACTIVE_TRACKERS, TRACKER_PRESETS } from "./kinds";
import { getSmsStatus } from "./queries";
import { checkinReminderKey, trackerReminderKey } from "./reminder-keys";
import {
  createTrackerSchema,
  reminderSchema,
  saveCheckinSchema,
  trackerCheckinSchema,
  trackerIdSchema,
  trackerReminderSchema,
} from "./schemas";
import type { PointsResult, ReminderSchedule } from "./types";

const trackerAction = permissionAction("tracker.use");

function revalidateTracker() {
  revalidatePath("/tracker", "layout");
  revalidatePath("/");
}

/** Today's in-app reminder has done its job once the person checks in. */
async function dismissReminder(userId: string, dedupeKey: string) {
  try {
    await db
      .update(notifications)
      .set({ dismissedAt: new Date() })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.dedupeKey, dedupeKey), isNull(notifications.dismissedAt)),
      );
  } catch (error) {
    logger.warn({ userId, err: (error as Error).message }, "dismiss tracker reminder failed");
  }
}

async function assertCanText(userId: string, reminder: Pick<ReminderSchedule, "enabled" | "channel">) {
  if (!reminder.enabled || reminder.channel !== "sms") return;
  const sms = await getSmsStatus(userId);
  if (!sms.hasPhone) throw new UserFacingError("Add your mobile number to your profile to get text reminders.");
  if (sms.optedOut) throw new UserFacingError("You've turned off text messages. Choose in-app reminders instead.");
}

/** The reminder as stored (jsonb, written whole); `text` only for personal trackers. */
function cleanReminder(reminder: ReminderSchedule, withText: boolean): ReminderScheduleJson {
  const { text, ...rest } = reminder;
  return withText && text ? { ...rest, text } : rest;
}

/**
 * Saves today's meds and/or mood answer (legacy `checkin_lp_today_callback`).
 * Changing an answer later the same day updates it. Points: +2 once per day.
 */
export const saveCheckin = trackerAction.inputSchema(saveCheckinSchema).action(async ({ parsedInput, ctx }) => {
  const { viewer } = ctx;
  const day = dayKey(new Date(), viewer.timezone);
  const now = new Date();
  const set: { meds?: boolean; medsAt?: Date; mood?: number; moodAt?: Date } = {};
  if (parsedInput.meds !== undefined) Object.assign(set, { meds: parsedInput.meds, medsAt: now });
  if (parsedInput.mood !== undefined) Object.assign(set, { mood: parsedInput.mood, moodAt: now });

  const [saved] = await db
    .insert(dailyCheckins)
    .values({ userId: viewer.id, day, ...set })
    .onConflictDoUpdate({ target: [dailyCheckins.userId, dailyCheckins.day], set })
    .returning({ meds: dailyCheckins.meds, mood: dailyCheckins.mood });

  const points: PointsResult = await award({ userId: viewer.id, reason: "tracker_checkin", key: `checkin:${day}` });
  await dismissReminder(viewer.id, checkinReminderKey(day));
  revalidateTracker();
  return { today: { day, meds: saved?.meds ?? null, mood: saved?.mood ?? null }, points };
});

/** Daily check-in reminder settings (legacy `save_rem_tracking` / profile reminder form). +25 once. */
export const saveCheckinReminder = trackerAction.inputSchema(reminderSchema).action(async ({ parsedInput, ctx }) => {
  const { viewer } = ctx;
  await assertCanText(viewer.id, parsedInput);
  const reminder = cleanReminder(parsedInput, false);
  await db
    .insert(checkinReminders)
    .values({ userId: viewer.id, reminder })
    .onConflictDoUpdate({ target: checkinReminders.userId, set: { reminder } });
  const points: PointsResult = parsedInput.enabled
    ? await award({ userId: viewer.id, reason: "tracker_settings", key: "tracker-settings:checkin" })
    : { awarded: false };
  revalidateTracker();
  return { points };
});

/** Creates a personal tracker (legacy `save_tracking`). +25, at most once a day. */
export const createTracker = trackerAction.inputSchema(createTrackerSchema).action(async ({ parsedInput, ctx }) => {
  const { viewer } = ctx;
  const userId = viewer.id;
  const active = await db
    .select({ kind: trackers.kind, label: trackers.label })
    .from(trackers)
    .where(and(eq(trackers.userId, userId), isNull(trackers.deletedAt)));
  if (active.length >= MAX_ACTIVE_TRACKERS) {
    throw new UserFacingError(`You can track up to ${MAX_ACTIVE_TRACKERS} things at once. Remove one to add another.`);
  }

  const preset = TRACKER_PRESETS.find((item) => item.kind === parsedInput.kind);
  const label = preset ? preset.label : parsedInput.label!.trim();
  const duplicate = active.some((tracker) =>
    preset ? tracker.kind === preset.kind : tracker.label.toLowerCase() === label.toLowerCase(),
  );
  if (duplicate) throw new UserFacingError(`You're already tracking ${label}.`);
  await assertCanText(viewer.id, parsedInput.reminder);

  const [tracker] = await db
    .insert(trackers)
    .values({
      userId,
      kind: parsedInput.kind,
      label,
      legacyTermId: preset?.termId ?? 0,
      reminder: cleanReminder(parsedInput.reminder, true),
    })
    .returning({ id: trackers.id });
  const day = dayKey(new Date(), viewer.timezone);
  const points: PointsResult = await award({ userId: viewer.id, reason: "tracker_create", key: `tracker-create:${day}` });
  revalidateTracker();
  return { id: tracker!.id, points };
});

async function ownTracker(userId: string, trackerId: string) {
  const [tracker] = await db
    .select({ id: trackers.id, label: trackers.label })
    .from(trackers)
    .where(and(eq(trackers.id, trackerId), eq(trackers.userId, userId), isNull(trackers.deletedAt)))
    .limit(1);
  if (!tracker) throw new UserFacingError("That tracker isn't available anymore.");
  return tracker;
}

/** Yes/No for a personal tracker today (legacy `save_checkin`). +2 once per tracker per day. */
export const checkInTracker = trackerAction.inputSchema(trackerCheckinSchema).action(async ({ parsedInput, ctx }) => {
  const { viewer } = ctx;
  const tracker = await ownTracker(viewer.id, parsedInput.trackerId);
  const day = dayKey(new Date(), viewer.timezone);
  await db
    .insert(trackerEntries)
    .values({ userId: viewer.id, trackerId: tracker.id, day, done: parsedInput.done })
    .onConflictDoUpdate({ target: [trackerEntries.trackerId, trackerEntries.day], set: { done: parsedInput.done } });
  const points: PointsResult = await award({
    userId: viewer.id,
    reason: "tracker_checkin",
    key: `tracker-checkin:${parsedInput.trackerId}:${day}`,
  });
  await dismissReminder(viewer.id, trackerReminderKey(parsedInput.trackerId, day));
  revalidateTracker();
  return { day, done: parsedInput.done, points };
});

/** Reminder settings of one personal tracker (legacy `edit_save_tracking`, now per tracker). */
export const updateTrackerReminder = trackerAction
  .inputSchema(trackerReminderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { viewer } = ctx;
    const tracker = await ownTracker(viewer.id, parsedInput.trackerId);
    await assertCanText(viewer.id, parsedInput.reminder);
    await db
      .update(trackers)
      .set({ reminder: cleanReminder(parsedInput.reminder, true) })
      .where(eq(trackers.id, tracker.id));
    revalidateTracker();
    return { ok: true };
  });

/**
 * Stops a personal tracker (the old `/delete-tracking` route was dead). Past
 * answers are kept for the study; reminders stop and pending ones are removed.
 */
export const deleteTracker = trackerAction.inputSchema(trackerIdSchema).action(async ({ parsedInput, ctx }) => {
  const { viewer } = ctx;
  const tracker = await ownTracker(viewer.id, parsedInput.trackerId);
  await db
    .update(trackers)
    .set({
      deletedAt: new Date(),
      reminder: sql`jsonb_set(${trackers.reminder}, '{enabled}', 'false'::jsonb)`,
    })
    .where(eq(trackers.id, tracker.id));
  await retractNotifications(trackerReminderKey(parsedInput.trackerId, ""));
  revalidateTracker();
  return { label: tracker.label };
});
