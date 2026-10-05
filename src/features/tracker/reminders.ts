import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { env } from "@/env";
import { notify } from "@/features/notifications/notify";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import {
  checkinReminders,
  dailyCheckins,
  profiles,
  trackerEntries,
  trackerReminderLogs,
  trackers,
  users,
  type ReminderLogStatus,
} from "@/server/db/schema";
import { logger } from "@/server/logger";
import { sendSms } from "@/server/services/sms";
import { checkinReminderKey, trackerReminderKey } from "./reminder-keys";
import { toSchedule } from "./queries";
import { dueSlot } from "./schedule";
import type { ReminderSchedule } from "./types";

/**
 * Sends the daily check-in and personal tracker reminders that are due now
 * (legacy cron jobs `med_tracking_sms` and `tracking_sms`, plus the in-app
 * reminder cards of twm_comment_notification).
 *
 * - Each participant's own timezone decides when a slot is due.
 * - A slot is claimed in `trackerReminderLogs` (unique key) before sending, so
 *   it goes out at most once however often or late the job runs.
 * - Texts are sent up to 2 hours late (a missed run still delivers); in-app
 *   reminders stay due until local midnight and come back the next due day.
 * - Nothing is sent when the person already checked in for that day.
 */

const SMS_GRACE_MINUTES = 120;

type Target = {
  userId: string;
  target: "checkin" | "tracker";
  trackerId?: string;
  label?: string;
  reminder: ReminderSchedule;
};

type Person = { timezone: string; firstName: string; phone: string | null; optedOut: boolean };

function appUrl(path: string) {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

export function smsBody(target: Pick<Target, "target" | "label" | "reminder">, link: string) {
  const weekly = target.reminder.frequency === "weekly";
  if (target.target === "checkin") {
    return weekly
      ? `Did you fill out your check-in this week ☑️? Click ${link} to add your entry on LinkPositively.`
      : `Did you fill out your daily check-in today ☑️? Click ${link} to add your entry on LinkPositively.`;
  }
  const lead =
    target.reminder.text?.trim() ||
    (weekly ? `Did you fill out your ${target.label} tracker this week ☑️?` : `Did you fill out your ${target.label} tracker today ☑️?`);
  return `${lead} Click ${link} to add your entry on LinkPositively.`;
}

export function inAppText(target: Pick<Target, "target" | "label" | "reminder">, firstName: string) {
  if (target.target === "checkin") return `Hi ${firstName}, have you filled out your daily check-in yet?`;
  if (target.reminder.text?.trim()) return `Hi ${firstName}. ${target.reminder.text.trim()}`;
  return `Hi ${firstName}, have you checked in on ${target.label} yet?`;
}

async function loadTargets(): Promise<Target[]> {
  const [checkins, trackerRows] = await Promise.all([
    db
      .select({ userId: checkinReminders.userId, reminder: checkinReminders.reminder })
      .from(checkinReminders)
      .where(eq(checkinReminders.reminderEnabled, true)),
    db
      .select({ id: trackers.id, userId: trackers.userId, label: trackers.label, reminder: trackers.reminder })
      .from(trackers)
      .where(and(eq(trackers.reminderEnabled, true), isNull(trackers.deletedAt))),
  ]);
  return [
    ...checkins.map((row) => ({
      userId: row.userId,
      target: "checkin" as const,
      reminder: toSchedule(row.reminder),
    })),
    ...trackerRows.map((row) => ({
      userId: row.userId,
      target: "tracker" as const,
      trackerId: row.id,
      label: row.label,
      reminder: toSchedule(row.reminder),
    })),
  ];
}

async function loadPeople(userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map<string, Person>();
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      banned: users.banned,
      timezone: users.timezone,
      name: users.name,
      firstName: profiles.firstName,
      phone: profiles.phone,
      smsOptOut: profiles.smsOptOut,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(users.id, ids));
  const people = new Map<string, Person>();
  for (const user of rows) {
    // Only people who can still use the tracker (e.g. not blocked or de-randomized).
    if (user.banned || !hasPermission(parseRoles(user.role), "tracker.use")) continue;
    people.set(user.id, {
      timezone: user.timezone || DEFAULT_TIMEZONE,
      firstName: user.firstName || user.name?.split(" ")[0] || "there",
      phone: user.phone || null,
      optedOut: Boolean(user.smsOptOut),
    });
  }
  return people;
}

async function alreadyCheckedIn(target: Target, day: string) {
  if (target.target === "checkin") {
    const [row] = await db
      .select({ meds: dailyCheckins.meds, mood: dailyCheckins.mood })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, target.userId), eq(dailyCheckins.day, day)))
      .limit(1);
    return Boolean(row && row.meds !== null && row.mood !== null);
  }
  const [entry] = await db
    .select({ id: trackerEntries.id })
    .from(trackerEntries)
    .where(and(eq(trackerEntries.trackerId, target.trackerId!), eq(trackerEntries.day, day)))
    .limit(1);
  return Boolean(entry);
}

export type ReminderRunResult = { due: number; sent: number; skipped: number; failed: number };

export async function sendDueReminders(now = new Date()): Promise<ReminderRunResult> {
  const targets = await loadTargets();
  const people = await loadPeople(targets.map((target) => target.userId));
  const result: ReminderRunResult = { due: 0, sent: 0, skipped: 0, failed: 0 };

  for (const target of targets) {
    const person = people.get(target.userId);
    if (!person) continue;
    const sms = target.reminder.channel === "sms";
    const day = dueSlot(
      target.reminder,
      now,
      person.timezone,
      sms ? { graceMinutes: SMS_GRACE_MINUTES } : { graceMinutes: 24 * 60, includePreviousDay: false },
    );
    if (!day) continue;

    const key = `${target.target === "checkin" ? `checkin:${target.userId}` : `tracker:${target.trackerId}`}:${day}`;
    const claimed = await db
      .insert(trackerReminderLogs)
      .values({
        key,
        userId: target.userId,
        target: target.target,
        trackerId: target.trackerId ?? null,
        day,
        channel: target.reminder.channel,
      })
      .onConflictDoNothing({ target: trackerReminderLogs.key })
      .returning({ id: trackerReminderLogs.id });
    if (!claimed.length) continue; // this slot was already handled
    result.due += 1;

    const finish = async (status: ReminderLogStatus, error?: string) => {
      await db
        .update(trackerReminderLogs)
        .set({ status, ...(error ? { error } : {}) })
        .where(eq(trackerReminderLogs.key, key));
      if (status === "sent") result.sent += 1;
      else if (status === "failed") result.failed += 1;
      else result.skipped += 1;
    };

    if (await alreadyCheckedIn(target, day)) {
      await finish("skipped_done");
      continue;
    }

    const path = target.target === "checkin" ? "/tracker" : `/tracker/personal/${target.trackerId}`;
    if (sms) {
      if (!person.phone) {
        await finish("skipped_no_phone");
        continue;
      }
      if (person.optedOut) {
        await finish("skipped_opt_out");
        continue;
      }
      const sent = await sendSms({ to: person.phone, body: smsBody(target, appUrl(path)), ref: `tracker-reminder:${key}` });
      await finish(sent.ok ? "sent" : "failed", sent.ok ? undefined : sent.error);
    } else {
      await notify({
        userId: target.userId,
        kind: target.target === "checkin" ? "checkin_reminder" : "tracker_reminder",
        text: inAppText(target, person.firstName),
        href: path,
        dedupeKey: target.target === "checkin" ? checkinReminderKey(day) : trackerReminderKey(target.trackerId!, day),
      });
      await finish("sent");
    }
  }

  if (result.due) logger.info(result, "tracker reminders");
  return result;
}
