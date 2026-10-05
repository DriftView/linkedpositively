import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, enumCheck, id, legacyColumns, legacyConstraints, timestamps, tstz } from "./_shared";
import { users } from "./auth";

/**
 * When and how to remind someone to check in. Shared by the daily check-in
 * reminder (`checkinReminders`) and every personal tracker (`trackers`).
 * Times are wall-clock times in the participant's own timezone.
 *
 * Legacy columns: reminders (0 SMS, 1 in-app) → channel; how_often (0 daily,
 * 1 weekly) → frequency; day (0 Sun … 6 Sat) → weekday; hour 0–23; minute
 * (0 → :00, 1 → :30) → minute 0 | 30; ts_tracking.flag → enabled;
 * ts_tracking.noti_text → text.
 *
 * Stored as jsonb; `reminderEnabled` is a generated column copied from
 * `reminder.enabled` so jobs can filter and index on it (never write it).
 */
export type ReminderScheduleJson = {
  enabled: boolean;
  channel: "sms" | "in_app";
  frequency: "daily" | "weekly";
  /** 0 = Sunday … 6 = Saturday; used when weekly. */
  weekday: number;
  hour: number;
  minute: 0 | 30;
  /** Personal trackers only: the participant's own reminder wording. */
  text?: string;
};

export const DEFAULT_REMINDER_SCHEDULE: ReminderScheduleJson = {
  enabled: false,
  channel: "in_app",
  frequency: "daily",
  weekday: 1,
  hour: 20,
  minute: 0,
};

const reminderColumns = () => ({
  reminder: jsonb().$type<ReminderScheduleJson>().notNull().default(DEFAULT_REMINDER_SCHEDULE),
  reminderEnabled: boolean()
    .notNull()
    .generatedAlwaysAs(sql`(coalesce(("reminder"->>'enabled')::boolean, false))`),
});

/** Tracker types offered when creating a tracker (legacy vocabulary `custom_tracking`). */
export const TRACKER_KINDS = ["hormones", "prep", "sex", "custom"] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/**
 * A personal tracker ("Did you take your PrEP today?") with its own reminder.
 * 🔒 Health data.
 *
 * Legacy: LP `ts_tracking` (tid → kind/legacyTermId, text → label, reminder
 * settings; flag → reminder.enabled) plus `ts_tracking_time` (which was one
 * time per *user*; here every tracker has its own time). Deleting a tracker
 * sets `deletedAt` so past check-ins stay available to the study.
 */
export const trackers = pgTable(
  "trackers",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().$type<TrackerKind>().notNull(),
    /** Display name: the term name for preset kinds, the participant's words for custom. */
    label: text().notNull(),
    /** custom_tracking term id (296 Hormones, 297 PrEP, 298 Sex), 0 for custom. */
    legacyTermId: integer(),
    ...reminderColumns(),
    deletedAt: tstz(),
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("trackers", t),
    index("trackers_user_deleted_created_idx").on(t.userId, t.deletedAt, t.createdAt),
    index("trackers_reminder_enabled_idx")
      .on(t.reminderEnabled, t.deletedAt)
      .where(sql`${t.reminderEnabled}`),
    enumCheck("trackers_kind_ck", t.kind, TRACKER_KINDS),
  ],
);

/**
 * One yes/no answer for a personal tracker on a local calendar day.
 * 🔒 Health data. Legacy: LP `ts_tracking_data` (tid = ts_tracking.id,
 * checkin 1/0, created unix) — one row per tracker per day, updated in place.
 */
export const trackerEntries = pgTable(
  "tracker_entries",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackerId: uuid()
      .notNull()
      .references(() => trackers.id, { onDelete: "cascade" }),
    /** Local calendar day in the participant's timezone, "yyyy-MM-dd". */
    day: date({ mode: "string" }).notNull(),
    done: boolean().notNull(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("tracker_entries", t),
    uniqueIndex("tracker_entries_tracker_day_uq").on(t.trackerId, t.day),
    index("tracker_entries_user_day_idx").on(t.userId, t.day),
  ],
);

/**
 * Daily check-in ("Main tracker": meds & mood) reminder settings, one per user.
 * Legacy: LP `reminder_checkin_time`. (Mongoose model `CheckinReminder` in tracker-reminder.ts.)
 */
export const checkinReminders = pgTable(
  "checkin_reminders",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    ...reminderColumns(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("checkin_reminders", t),
    index("checkin_reminders_enabled_idx")
      .on(t.reminderEnabled)
      .where(sql`${t.reminderEnabled}`),
  ],
);

export const REMINDER_LOG_TARGETS = ["checkin", "tracker"] as const;
export const REMINDER_CHANNELS = ["sms", "in_app"] as const;
export const REMINDER_LOG_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped_no_phone",
  "skipped_opt_out",
  "skipped_done",
] as const;
export type ReminderLogStatus = (typeof REMINDER_LOG_STATUSES)[number];

/**
 * One row per reminder *slot* (a target on a local day). The unique `key` is
 * claimed before anything is sent, so a slot is delivered at most once even if
 * the job runs late, twice, or is retried. Also gives the study a record of
 * tracker reminders, which the old site never logged. No message bodies or
 * phone numbers are stored.
 */
export const trackerReminderLogs = pgTable(
  "tracker_reminder_logs",
  {
    id: id(),
    /** "<target>:<yyyy-MM-dd>", target = "checkin:<userId>" or "tracker:<trackerId>". */
    key: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    target: text().$type<(typeof REMINDER_LOG_TARGETS)[number]>().notNull(),
    trackerId: uuid().references(() => trackers.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    channel: text().$type<(typeof REMINDER_CHANNELS)[number]>().notNull(),
    status: text().$type<ReminderLogStatus>().notNull().default("pending"),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("tracker_reminder_logs_user_created_idx").on(t.userId, t.createdAt.desc()),
    enumCheck("tracker_reminder_logs_target_ck", t.target, REMINDER_LOG_TARGETS),
    enumCheck("tracker_reminder_logs_channel_ck", t.channel, REMINDER_CHANNELS),
    enumCheck("tracker_reminder_logs_status_ck", t.status, REMINDER_LOG_STATUSES),
  ],
);

export type Tracker = typeof trackers.$inferSelect;
export type NewTracker = typeof trackers.$inferInsert;
export type TrackerEntry = typeof trackerEntries.$inferSelect;
export type NewTrackerEntry = typeof trackerEntries.$inferInsert;
export type CheckinReminder = typeof checkinReminders.$inferSelect;
export type NewCheckinReminder = typeof checkinReminders.$inferInsert;
export type TrackerReminderLog = typeof trackerReminderLogs.$inferSelect;
export type NewTrackerReminderLog = typeof trackerReminderLogs.$inferInsert;
