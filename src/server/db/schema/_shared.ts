import { isNotNull, sql, type SQL } from "drizzle-orm";
import { check, customType, integer, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Building blocks shared by every table. Conventions (see docs/CONVENTIONS.md "Data"):
 * - TS field names are camelCase; the client and drizzle-kit use `casing: "snake_case"`,
 *   so `createdAt` is stored as `created_at` without naming every column.
 * - Every table has `id uuid primary key default gen_random_uuid()`.
 * - Enums are `text().$type<…>()` plus a CHECK constraint (`enumCheck`).
 */

/** `id uuid primary key default gen_random_uuid()`. */
export const id = () => uuid().primaryKey().defaultRandom();

/** `timestamptz`, read and written as JS `Date`. */
export const tstz = () => timestamp({ withTimezone: true, mode: "date" });

/** `created_at timestamptz not null default now()`. */
export const createdAt = () => tstz().notNull().defaultNow();

/** Mongoose `timestamps: true`: createdAt + updatedAt (bumped on every Drizzle update). */
export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Mongoose `timestamps: { createdAt: false, updatedAt: true }` (createdAt is set by the app). */
export const updatedAt = () => ({
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** CHECK that `column` is one of `values` (NULL passes, so it also works for nullable enums). */
export function enumCheck(name: string, column: AnyPgColumn, values: readonly (string | number)[]) {
  const list = sql.join(
    values.map((value) => sql.raw(typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`)),
    sql`, `,
  );
  return check(name, sql`${column} in (${list})`);
}

/** CHECK that a numeric column is within [min, max] (NULL passes). */
export function rangeCheck(name: string, column: AnyPgColumn, min: number, max: number) {
  return check(name, sql`${column} between ${sql.raw(String(min))} and ${sql.raw(String(max))}`);
}

// ---------------------------------------------------------------------------
// Legacy (Drupal) ids
// ---------------------------------------------------------------------------

export const LEGACY_SITES = ["lp", "peernav"] as const;
export type LegacySite = (typeof LEGACY_SITES)[number];

/**
 * Where a migrated row came from in Drupal, e.g. site "lp", table "node", id 812.
 * Replaces the Mongo `legacy: { site, table, id }` subdocument (`withLegacy`).
 * Unique per table (see `legacyConstraints`), so the migration can be re-run
 * without creating duplicates. `legacyTable` is required whenever `legacyId` is set.
 */
export const legacyColumns = () => ({
  legacySite: text().$type<LegacySite>(),
  legacyTable: text(),
  legacyId: integer(),
});

type LegacyCols = { legacySite: AnyPgColumn; legacyTable: AnyPgColumn; legacyId: AnyPgColumn };

/**
 * Unique index on (legacy_site, legacy_table, legacy_id) where legacy_id is not null,
 * plus a CHECK that site and table are set whenever legacy_id is. Spread into the
 * table's extra config: `(t) => [...legacyConstraints("posts", t), …]`.
 */
export function legacyConstraints(table: string, t: LegacyCols) {
  return [
    uniqueIndex(`${table}_legacy_uq`)
      .on(t.legacySite, t.legacyTable, t.legacyId)
      .where(sql`${t.legacyId} is not null`),
    check(
      `${table}_legacy_ck`,
      sql`${t.legacyId} is null or (${t.legacySite} in ('lp', 'peernav') and ${t.legacyTable} is not null)`,
    ),
  ];
}

/**
 * Conflict target for idempotent migration upserts keyed on the legacy id:
 * `db.insert(posts).values(row).onConflictDoUpdate({ ...legacyConflict(posts), set: {...} })`.
 */
export function legacyConflict(t: LegacyCols) {
  return {
    target: [t.legacySite, t.legacyTable, t.legacyId] as AnyPgColumn[],
    targetWhere: isNotNull(t.legacyId) as SQL,
  };
}

// ---------------------------------------------------------------------------
// Custom types
// ---------------------------------------------------------------------------

/** Postgres `tsvector` (used for generated full-text search columns). */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** Stored image reference used by posts and comments (was `photoSchema`). */
export type Photo = { key: string; type?: string; width?: number; height?: number };
