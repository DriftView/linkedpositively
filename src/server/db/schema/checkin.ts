import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

/** One Likert answer option of a check-in prompt. */
export type LikertOption = { value: number; label: string };

/**
 * Weekly check-in prompt for one slot of the 10-week rotation (Drupal node
 * type `weekly_checkin_prompt`). Spec: docs/legacy/02-checkin-and-tips.md §2.1.
 */
export const checkinPrompts = pgTable(
  "checkin_prompts",
  {
    id: id(),
    sequence: integer().notNull().unique(),
    title: text().notNull(),
    likertText: text().notNull(),
    /** Options with value 1–5 and a label (was an array of subdocuments). */
    likertOptions: jsonb().$type<LikertOption[]>().notNull().default([]),
    openText: text().notNull(),
    openPlaceholder: text().notNull().default(""),
    /** Feedback HTML shown after answering: Likert 1–2 low, 3 medium, 4–5 high. */
    feedbackLow: text().notNull().default(""),
    feedbackMedium: text().notNull().default(""),
    feedbackHigh: text().notNull().default(""),
    /** Shown from the second prompt on: all 7 days' meds taken → more, else less. */
    moreAdherentFeedback: text().notNull().default(""),
    lessAdherentFeedback: text().notNull().default(""),
    /** Legacy field_medication_taking_feedback (unused by the old code, kept). */
    medicationFeedback: text().notNull().default(""),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [...legacyConstraints("checkin_prompts", t), rangeCheck("checkin_prompts_sequence_ck", t.sequence, 1, 10)],
);

/** One day of a weekly check-in (the legacy `weekly_checkin_feedback` rows). */
export type WeeklyCheckinDay = {
  date: string; // yyyy-MM-dd in the participant's timezone
  medsTaken: boolean | null;
  /** Daily-tracker mood code 1–12 (features/tracker/moods.ts), null = none. */
  mood: number | null;
  /** "Used street drugs or alcohol?" — null = not answered. */
  used: boolean | null;
};

/**
 * 🔒 A participant's weekly check-in for one study week (legacy node type
 * `weekly_checkins` "Week{N} Feedback" + its 7 `weekly_checkin_feedback` rows,
 * which the migration folds into `days`). Health data: visible to the
 * participant only (and research exports).
 */
export const weeklyCheckins = pgTable(
  "weekly_checkins",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    week: integer().notNull(),
    weekStart: date({ mode: "string" }).notNull(), // yyyy-MM-dd
    weekEnd: date({ mode: "string" }).notNull(),
    days: jsonb().$type<WeeklyCheckinDay[]>().notNull().default([]),

    promptId: uuid().references(() => checkinPrompts.id, { onDelete: "set null" }),
    promptSequence: integer(),
    /** Snapshot of the questions as asked. */
    likertText: text(),
    openText: text(),
    likertValue: integer(),
    likertLabel: text(),
    openAnswer: text(),
    /** Feedback shown (legacy field_feedback_long / field_feedback_short). */
    feedbackLong: text(),
    feedbackShort: text(),

    submittedAt: tstz(),
    /** Stored by the daily job when the window closed without an answer. */
    autoSubmitted: boolean().notNull().default(false),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("weekly_checkins", t),
    uniqueIndex("weekly_checkins_user_week_uq").on(t.userId, t.week),
    index("weekly_checkins_user_created_idx").on(t.userId, t.createdAt.desc()),
    check("weekly_checkins_week_ck", sql`${t.week} >= 1`),
    rangeCheck("weekly_checkins_likert_ck", t.likertValue, 1, 5),
  ],
);

/**
 * The daily "Main tracker" check-in: did you take your meds today, and how
 * are you feeling (mood 1–12, see features/tracker/moods.ts). One row per
 * user per local calendar day. 🔒 Health data: never shown to other participants.
 *
 * Legacy: LP `reminder_checkin` (uid, meds 1/0/NULL, moods 1–12/NULL, checkin
 * (unused), created = server-local midnight). `day` is the participant's local
 * date, which the old site got wrong (it used the server's day).
 */
export const dailyCheckins = pgTable(
  "daily_checkins",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Local calendar day in the participant's timezone, "yyyy-MM-dd" (Postgres `date`, read as string). */
    day: date({ mode: "string" }).notNull(),
    /** true = took meds, false = missed, null = not answered. */
    meds: boolean(),
    /** 1 Happy … 12 Angry, null = not answered. */
    mood: integer(),
    medsAt: tstz(),
    moodAt: tstz(),
    /** Legacy fields with no dedicated home (e.g. the unused `checkin` flag). */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("daily_checkins", t),
    uniqueIndex("daily_checkins_user_day_uq").on(t.userId, t.day),
    rangeCheck("daily_checkins_mood_ck", t.mood, 1, 12),
  ],
);

export type CheckinPrompt = typeof checkinPrompts.$inferSelect;
export type NewCheckinPrompt = typeof checkinPrompts.$inferInsert;
export type WeeklyCheckin = typeof weeklyCheckins.$inferSelect;
export type NewWeeklyCheckin = typeof weeklyCheckins.$inferInsert;
export type DailyCheckin = typeof dailyCheckins.$inferSelect;
export type NewDailyCheckin = typeof dailyCheckins.$inferInsert;
