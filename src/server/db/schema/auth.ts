import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tstz, type LegacySite } from "./_shared";

/**
 * Better Auth tables (core + username + admin plugins + rate limit), in the
 * shape its Drizzle adapter expects (generated from Better Auth 1.7.6 with
 * `advanced.database.generateId: "uuid"`). Better Auth owns writes to the auth
 * fields; app code writes only the fields it adds (e.g. `image`).
 * The adapter is given `{ user: users, session: sessions, account: accounts,
 * verification: verifications, rateLimit: rateLimits }` (src/server/auth/auth.ts).
 */

/** `user.legacy`: the Drupal account this user was migrated from. */
export type UserLegacy = { site: LegacySite; table?: string; id: number; [key: string]: unknown };

export const users = pgTable(
  "user",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    createdAt: createdAt(),
    updatedAt: tstz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // username plugin
    username: text().unique(),
    displayUsername: text(),
    // admin plugin. `role` is a comma-separated list of roles (see auth/roles.ts serializeRoles).
    role: text(),
    banned: boolean().default(false),
    banReason: text(),
    banExpires: tstz(),
    // additionalFields (auth.ts)
    timezone: text().default("America/New_York"),
    programs: text()
      .array()
      .default(sql`ARRAY['lp']::text[]`),
    legacy: jsonb().$type<UserLegacy>(),
    /**
     * Generated from `legacy` (read-only) so the data migration can upsert users
     * by Drupal uid: unique (legacy_site, legacy_id) where legacy_id is not null.
     */
    legacySite: text()
      .$type<LegacySite>()
      .generatedAlwaysAs(sql`("legacy"->>'site')`),
    legacyId: integer().generatedAlwaysAs(
      sql`(case when ("legacy"->>'id') ~ '^[0-9]{1,9}$' then ("legacy"->>'id')::integer end)`,
    ),
  },
  (t) => [
    uniqueIndex("user_legacy_uq")
      .on(t.legacySite, t.legacyId)
      .where(sql`${t.legacyId} is not null`),
  ],
);

export const sessions = pgTable(
  "session",
  {
    id: id(),
    expiresAt: tstz().notNull(),
    token: text().notNull().unique(),
    createdAt: createdAt(),
    updatedAt: tstz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // admin plugin
    impersonatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: tstz(),
    refreshTokenExpiresAt: tstz(),
    scope: text(),
    /** Modern hash, or a Drupal `$S$` hash until the user's first sign-in (auth.ts upgrades it). */
    password: text(),
    createdAt: createdAt(),
    updatedAt: tstz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verification",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: tstz().notNull(),
    createdAt: createdAt(),
    updatedAt: tstz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimits = pgTable("rate_limit", {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
