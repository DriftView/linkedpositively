import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { enumCheck, id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

/**
 * The weekly SMS program's message texts: WELCOME plus WEEK-1…WEEK-24.
 * Legacy: hard-coded PHP constants in `youthrive_sms_reminders` (the unused
 * `reminder_messages` nodes were never read). Staff can now edit them.
 *
 * `body` may contain one `<link>` placeholder, replaced at send time by the
 * participant's signed short link (/r/<code>) to `linkPath`.
 */
export const smsTemplates = pgTable(
  "sms_templates",
  {
    id: id(),
    /** "WELCOME" or "WEEK-<n>" (the legacy `sms_flag`). */
    key: text().notNull().unique(),
    /** 0 for WELCOME, 1–24 for weekly messages. */
    week: integer().notNull(),
    body: text().notNull(),
    /** In-app path the short link opens, e.g. "/tips". Empty = no link. */
    linkPath: text().notNull().default("/"),
    /** Public MMS image path under /sms, e.g. "/sms/image1.jpg". Empty = plain SMS. */
    mediaPath: text().notNull().default(""),
    active: boolean().notNull().default(true),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("sms_templates_week_idx").on(t.week),
    check("sms_templates_key_ck", sql`${t.key} ~ '^(WELCOME|WEEK-[0-9]{1,2})$'`),
    rangeCheck("sms_templates_week_ck", t.week, 0, 52),
  ],
);

export const SMS_SEND_STATUSES = ["scheduled", "sending", "sent", "failed", "skipped", "cancelled"] as const;
export type SmsSendStatus = (typeof SMS_SEND_STATUSES)[number];

/**
 * One planned or sent program message per participant, flag and study cycle.
 *
 * The whole schedule is written when a participant is randomized, with a
 * deterministic send time per week (see features/sms/schedule.ts), so it is
 * stable and auditable. The sender claims rows atomically (scheduled →
 * sending, e.g. `update … where status = 'scheduled' … returning`, or
 * `select … for update skip locked`), which makes every message go out at most once.
 *
 * Legacy: `uy_sms_reminder_stats` (uid, sms_to, sms_from, message_sid,
 * sms_created_date in user-local time, sms_flag) — sent rows only.
 * 🔒 Contains the participant's phone number.
 */
export const smsSends = pgTable(
  "sms_sends",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "WELCOME", "WEEK-<n>", or historic flags ("WEEK-19+FOUR", "MIDPOINT-1"). */
    flag: text().notNull(),
    week: integer().notNull().default(0),
    /** Intervention start day ("yyyy-MM-dd") this schedule belongs to; "legacy" for imported rows. */
    cycle: text().notNull(),
    scheduledFor: tstz().notNull(),
    timezone: text().notNull().default("America/New_York"),
    status: text().$type<SmsSendStatus>().notNull().default("scheduled"),
    /** Why a message was skipped, cancelled or failed (machine-readable, never user text). */
    reason: text(),
    to: text(),
    from: text(),
    /** Snapshot of what was sent. */
    body: text(),
    mediaUrl: text(),
    linkPath: text(),
    messageSid: text(),
    attempts: integer().notNull().default(0),
    claimedAt: tstz(),
    sentAt: tstz(),
    /** First click on this message's link, and the number of clicks. */
    clickedAt: tstz(),
    clicks: integer().notNull().default(0),
    /** Staff member who re-sent or cancelled it by hand. */
    handledBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("sms_sends", t),
    uniqueIndex("sms_sends_user_flag_cycle_uq").on(t.userId, t.flag, t.cycle),
    index("sms_sends_status_scheduled_idx").on(t.status, t.scheduledFor),
    index("sms_sends_scheduled_idx").on(t.scheduledFor.desc()),
    index("sms_sends_sent_idx").on(t.sentAt.desc()),
    enumCheck("sms_sends_status_ck", t.status, SMS_SEND_STATUSES),
  ],
);

/**
 * Engagement with a program message's link: one row per participant, flag
 * and cycle, with the first and latest click. Every click also records a
 * `sms_click` usage event for the reports.
 *
 * Legacy: `sms_engagement_messages` (uid, week "WEEK-n", clicked "Yes",
 * link_clicked_date) — first click only, and the uid came unverified from the
 * URL. Clicks are now resolved from a signed link.
 */
export const smsClicks = pgTable(
  "sms_clicks",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sendId: uuid().references(() => smsSends.id, { onDelete: "set null" }),
    flag: text().notNull(),
    week: integer().notNull().default(0),
    cycle: text().notNull().default("legacy"),
    firstClickAt: tstz().notNull().defaultNow(),
    lastClickAt: tstz().notNull().defaultNow(),
    count: integer().notNull().default(1),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("sms_clicks", t),
    uniqueIndex("sms_clicks_user_flag_cycle_uq").on(t.userId, t.flag, t.cycle),
    index("sms_clicks_first_click_idx").on(t.firstClickAt.desc()),
  ],
);

export const SMS_INBOUND_KINDS = ["stop", "start", "help", "message"] as const;
export type SmsInboundKind = (typeof SMS_INBOUND_KINDS)[number];

/**
 * Text messages sent back to the study number (Twilio webhook). The old site
 * dropped all of them; now opt-out keywords are honoured and other replies
 * are kept for staff. 🔒 Phone number and message text.
 */
export const smsInbound = pgTable(
  "sms_inbound",
  {
    id: id(),
    from: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    body: text().notNull().default(""),
    kind: text().$type<SmsInboundKind>().notNull().default("message"),
    messageSid: text(),
    receivedAt: tstz().notNull().defaultNow(),
    readAt: tstz(),
  },
  (t) => [
    index("sms_inbound_received_idx").on(t.receivedAt.desc()),
    index("sms_inbound_user_received_idx").on(t.userId, t.receivedAt.desc()),
    uniqueIndex("sms_inbound_message_sid_uq")
      .on(t.messageSid)
      .where(sql`${t.messageSid} is not null`),
    enumCheck("sms_inbound_kind_ck", t.kind, SMS_INBOUND_KINDS),
  ],
);

export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type NewSmsTemplate = typeof smsTemplates.$inferInsert;
export type SmsSend = typeof smsSends.$inferSelect;
export type NewSmsSend = typeof smsSends.$inferInsert;
export type SmsClick = typeof smsClicks.$inferSelect;
export type NewSmsClick = typeof smsClicks.$inferInsert;
export type SmsInbound = typeof smsInbound.$inferSelect;
export type NewSmsInbound = typeof smsInbound.$inferInsert;
