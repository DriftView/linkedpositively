import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

/**
 * Append-only points ledger. A user's total is the sum of their entries.
 * `key` makes an award idempotent (e.g. "tip-view:<tipId>" can only be
 * earned once): unique (user_id, key) where key is not null, so award with
 * `onConflictDoNothing({ target: [pointEntries.userId, pointEntries.key], where: sql\`key is not null\` })`.
 * Legacy source: `achievement_stats` (one row per id/user/day).
 */
export const pointEntries = pgTable(
  "point_entries",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    points: integer().notNull(),
    key: text(),
    at: tstz().notNull().defaultNow(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("point_entries", t),
    index("point_entries_user_at_idx").on(t.userId, t.at.desc()),
    index("point_entries_at_idx").on(t.at.desc()),
    uniqueIndex("point_entries_user_key_uq")
      .on(t.userId, t.key)
      .where(sql`${t.key} is not null`),
  ],
);

/**
 * Per-user gamification UI state. `celebratedLevel` is the highest level
 * whose level-up celebration the user has already seen, so the confetti
 * shows once per level (and never for levels reached before this existed).
 */
export const gamificationStates = pgTable("gamification_states", {
  id: id(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  celebratedLevel: integer().notNull().default(1),
  ...timestamps(),
});

/**
 * Staff-editable wording for each level (legacy variables `level{n}-name`
 * and `level{n}-desc`, admin/config/system/levels-description,
 * docs/legacy/04 §2.3). `headline` is shown as the level's promise ("At Level
 * 3 you unlock new avatar options!"), `description` as how to earn points
 * at that level. Levels 7–8 existed only as copy on the old site; they are
 * kept for a lossless migration but not shown.
 */
export const levelCopy = pgTable(
  "level_copy",
  {
    id: id(),
    level: integer().notNull().unique(),
    headline: text().notNull().default(""),
    description: text().notNull().default(""),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [...legacyConstraints("level_copy", t), rangeCheck("level_copy_level_ck", t.level, 1, 8)],
);

export type PointEntry = typeof pointEntries.$inferSelect;
export type NewPointEntry = typeof pointEntries.$inferInsert;
export type GamificationState = typeof gamificationStates.$inferSelect;
export type NewGamificationState = typeof gamificationStates.$inferInsert;
export type LevelCopy = typeof levelCopy.$inferSelect;
export type NewLevelCopy = typeof levelCopy.$inferInsert;
