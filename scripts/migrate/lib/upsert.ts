import { createHash } from "node:crypto";
import { getTableColumns, isNotNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Ctx } from "./context";

/**
 * Idempotent bulk upsert used by every migration step.
 *
 * - Conflict target: the table's legacy columns (legacy_site, legacy_table,
 *   legacy_id) by default, or a natural unique key (`target`).
 * - On conflict only the listed columns are updated, and only when one of
 *   them actually differs (`setWhere … is distinct from excluded…`), so a
 *   re-run touches nothing and `updatedAt` is not bumped.
 * - Returns how many rows were inserted, updated or already up to date
 *   (`xmax = 0` marks a freshly inserted row).
 */

type Row = Record<string, unknown>;

export type UpsertOptions = {
  /** Conflict columns (defaults to the legacy columns). */
  target?: AnyPgColumn[];
  targetWhere?: SQL;
  /** Columns to update on conflict (defaults to every column given in the rows except `id` and `createdAt`). */
  update?: string[];
  /** Never update these even if present in the rows. */
  keep?: string[];
  /** Insert only (`on conflict do nothing`). */
  insertOnly?: boolean;
};

function snake(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export async function upsertRows<T extends PgTable>(
  ctx: Ctx,
  statsName: string,
  table: T,
  rows: Row[],
  options: UpsertOptions = {},
) {
  const result = { inserted: 0, updated: 0, unchanged: 0 };
  if (!rows.length) return result;
  const columns = getTableColumns(table) as Record<string, AnyPgColumn>;
  const legacy = columns.legacySite && columns.legacyTable && columns.legacyId;
  const target = options.target ?? (legacy ? [columns.legacySite, columns.legacyTable, columns.legacyId] : undefined);
  const targetWhere = options.targetWhere ?? (options.target ? undefined : legacy ? (isNotNull(columns.legacyId) as SQL) : undefined);
  if (!target) throw new Error(`upsertRows(${statsName}): no conflict target`);

  const present = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) if (row[key] !== undefined) present.add(key);
  const keep = new Set(["id", "createdAt", ...(options.keep ?? [])]);
  const updateCols = (options.update ?? [...present]).filter((key) => !keep.has(key) && columns[key]);

  if (ctx.opts.dryRun) {
    result.unchanged += rows.length;
    ctx.stats.written(statsName, result);
    return result;
  }

  const chunkSize = 200;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    let query;
    const insert = ctx.db.insert(table).values(chunk as never);
    if (options.insertOnly || !updateCols.length) {
      query = insert.onConflictDoNothing({ target, where: targetWhere } as never);
    } else {
      const set: Record<string, SQL> = {};
      for (const key of updateCols) set[key] = sql.raw(`excluded."${snake(key)}"`);
      const changed = sql.join(
        updateCols.map((key) => sql`${columns[key]} is distinct from ${sql.raw(`excluded."${snake(key)}"`)}`),
        sql` or `,
      );
      query = insert.onConflictDoUpdate({ target, targetWhere, set, setWhere: sql`(${changed})` } as never);
    }
    const returned = (await query.returning({ inserted: sql<boolean>`(xmax = 0)` } as never)) as { inserted: boolean }[];
    const inserted = returned.filter((r) => r.inserted).length;
    result.inserted += inserted;
    result.updated += returned.length - inserted;
    result.unchanged += chunk.length - returned.length;
  }
  ctx.stats.written(statsName, result);
  return result;
}

/** `{ legacySite, legacyTable, legacyId }` for a migrated row. */
export function legacy(site: "lp" | "peernav", table: string, id: number | string) {
  return { legacySite: site, legacyTable: table, legacyId: Number(id) };
}

/** Keeps the first row per key (rows must be pre-sorted so the wanted one comes first). */
export function uniqueBy<R>(rows: R[], key: (row: R) => string) {
  const seen = new Set<string>();
  const out: R[] = [];
  let dropped = 0;
  for (const row of rows) {
    const k = key(row);
    if (seen.has(k)) {
      dropped++;
      continue;
    }
    seen.add(k);
    out.push(row);
  }
  return { rows: out, dropped };
}

/**
 * Stable uuid for a legacy entity that no longer exists (e.g. a deleted tip a
 * view record still points to): the same input always gives the same id, so
 * re-runs converge. Format: name-based (SHA-1, RFC 4122 version 5 layout).
 */
export function legacyUuid(site: string, table: string, id: number | string) {
  const hash = createHash("sha1").update(`linkpositively-legacy:${site}:${table}:${id}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
