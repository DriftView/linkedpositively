import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { enumCheck, id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

export const COLOR_THEMES = ["theme-1", "theme-2", "theme-3", "theme-4"] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

/**
 * Everything about a person beyond their login: display details, study data,
 * Peer Navigation details and UI state. One row per user.
 *
 * Sources (Drupal): LP user fields + profile2 `main`; PN user fields.
 * 🔒 = health/contact data; never expose to other participants.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),

    // Shown to others (public profile card): name, level, avatar, about me, badges.
    firstName: text(),
    pronouns: text(),
    location: text(),
    aboutMe: text(),
    age: integer(),

    // Avatar: a library avatar id, or an uploaded photo (storage key). Photo wins.
    avatarId: text(),
    photoKey: text(),
    /** Selected badge ids ("stickers"). */
    badges: text().array().notNull().default([]),
    /** Colour scheme, unlocked at level 6 (legacy field_theme). */
    colorTheme: text().$type<ColorTheme>().notNull().default("theme-1"),

    // Study data 🔒
    studyId: text(),
    phone: text(), // E.164, e.g. +15551234567
    interventionStartDate: tstz(), // start of week 1; set on randomization
    roleChangedAt: tstz(), // randomization time + 15 min (welcome SMS)
    smsOptOut: boolean().notNull().default(false),

    // Peer Navigation
    coachId: uuid().references(() => users.id, { onDelete: "set null" }),
    zoomLink: text(),
    onPrep: boolean(),
    participantCode: text(),

    // Per-user "last seen" markers (the old site kept some of these site-wide).
    lastWallVisitAt: tstz(),
    lastNotificationsSeenAt: tstz(),
    lastTipsSeenAt: tstz(),
    lastActiveAt: tstz(),

    /** Legacy fields with no dedicated home yet, kept verbatim for a lossless migration. */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("profiles", t),
    index("profiles_study_id_idx").on(t.studyId),
    index("profiles_coach_id_idx").on(t.coachId),
    enumCheck("profiles_color_theme_ck", t.colorTheme, COLOR_THEMES),
    rangeCheck("profiles_age_ck", t.age, 0, 120),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
