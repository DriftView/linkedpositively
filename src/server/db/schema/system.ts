import { index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, enumCheck, id, legacyColumns, legacyConstraints, timestamps, tstz, LEGACY_SITES } from "./_shared";
import { users } from "./auth";

/**
 * Site settings editable by staff (study contact, survey links, feature
 * switches) and small job state. One row per key; typed defaults and
 * validation live in features/admin/settings.ts.
 * Legacy: Drupal `variable` rows such as `midpoint_url`.
 */
export const appSettings = pgTable("app_settings", {
  id: id(),
  key: text().notNull().unique(),
  value: jsonb().$type<unknown>(),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  ...timestamps(),
});

export const AUDIT_ACTIONS = [
  "user.create",
  "user.update",
  "user.roles",
  "user.block",
  "user.unblock",
  "user.autoblock",
  "user.passwordLink",
  "user.welcomeLink",
  "user.coach",
  "user.impersonate",
  "user.impersonateStop",
  "randomize.participant",
  "randomize.control",
  "sms.template",
  "sms.test",
  "sms.resend",
  "sms.cancel",
  "sms.optout",
  "survey.config",
  "survey.sync",
  "survey.complete",
  "settings.update",
  "ai.alert",
  "ai.transcript",
  "ai.knowledge",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Append-only record of staff actions (role changes, blocks, impersonation,
 * randomization, settings…). The old site kept none. Holds ids and short
 * non-sensitive details only — no health data or message text.
 * Adding an action means adding it here and generating a migration (CHECK constraint).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    /** Null for automatic jobs (e.g. the 150-day auto-block). */
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Set when the actor was being impersonated by an admin. */
    impersonatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().$type<AuditAction>().notNull(),
    /** Affected users. uuid[] (no FK, kept after account deletion), GIN-indexed: `arrayContains(auditLog.targetIds, [userId])`. */
    targetIds: uuid().array().notNull().default([]),
    summary: text().notNull(),
    meta: jsonb().$type<Record<string, unknown>>(),
    at: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_at_idx").on(t.at.desc()),
    index("audit_log_target_ids_gin").using("gin", t.targetIds),
    index("audit_log_action_at_idx").on(t.action, t.at.desc()),
    enumCheck("audit_log_action_ck", t.action, AUDIT_ACTIONS),
  ],
);

export const NOTIFICATION_KINDS = [
  "post_comment", // "{user} made a comment on your post."
  "also_commented", // "{user} also made a comment on {author}'s post."
  "post_reaction", // "{user} reacted to your post."
  "comment_reaction", // "{user} reacted to your comment."
  "post_mention", // "{user} tagged you in a post."
  "comment_mention", // "{user} tagged you in a comment."
  "welcome",
  "time_on_site",
  "level",
  "tracker_reminder",
  "checkin_reminder",
  "survey",
  "message", // Peer Navigation private message
  "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * In-app notifications ("In App Message" cards and the bell). Stored when the
 * event happens, instead of being recomputed on every page like the old site.
 * `dedupeKey` is unique per user so re-sending the same event is a no-op
 * (`onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })`).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().$type<NotificationKind>().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    text: text().notNull(),
    excerpt: text(),
    reaction: text(),
    href: text(),
    dedupeKey: text().notNull(),
    createdAt: createdAt(),
    dismissedAt: tstz(),
    /** Reminders come back the next day: hidden only until this time. */
    hiddenUntil: tstz(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("notifications", t),
    uniqueIndex("notifications_user_dedupe_uq").on(t.userId, t.dedupeKey),
    index("notifications_user_dismissed_created_idx").on(t.userId, t.dismissedAt, t.createdAt.desc()),
    enumCheck("notifications_kind_ck", t.kind, NOTIFICATION_KINDS),
  ],
);

/**
 * Usage events feeding the study reports: page views of key features,
 * profile edits, resource views, content-warning clicks, SMS link clicks…
 * Legacy sources: ts_user_stats, youthrive_reports, profile_features_update,
 * user_tips_report and friends (see docs/legacy/06 Part 1).
 * `type` is free text (USAGE_TYPES in server/services/usage.ts), no CHECK.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    /** Small, non-sensitive details (ids, week numbers). Never free text. */
    meta: jsonb().$type<Record<string, string | number | boolean>>(),
    at: tstz().notNull().defaultNow(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("usage_events", t),
    index("usage_events_type_at_idx").on(t.type, t.at.desc()),
    index("usage_events_user_type_at_idx").on(t.userId, t.type, t.at.desc()),
  ],
);

export const LOGIN_PROGRAMS = LEGACY_SITES;
export type LoginProgram = (typeof LOGIN_PROGRAMS)[number];

/**
 * One row per sign-in, closed on sign-out. Feeds the standard usage reports
 * of both programs (legacy LP usage tables and PN `ecoach_usage_session`).
 */
export const loginSessions = pgTable(
  "login_sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    loginAt: tstz().notNull().defaultNow(),
    logoutAt: tstz(),
    userAgent: text().notNull().default(""),
    program: text().$type<LoginProgram>().notNull().default("lp"),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("login_sessions", t),
    index("login_sessions_user_idx").on(t.userId),
    index("login_sessions_login_at_idx").on(t.loginAt.desc()),
    index("login_sessions_user_logout_idx").on(t.userId, t.logoutAt),
    enumCheck("login_sessions_program_ck", t.program, LOGIN_PROGRAMS),
  ],
);

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type LoginSession = typeof loginSessions.$inferSelect;
export type NewLoginSession = typeof loginSessions.$inferInsert;
