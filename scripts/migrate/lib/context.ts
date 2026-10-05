/**
 * Shared state of one migration run: connections to the legacy MySQL
 * databases and to PostgreSQL, the command-line options and the per-table
 * statistics that end up in the report.
 *
 * Privacy: this data is health information. Logs and reports carry counts
 * and legacy ids only, never names, emails, phone numbers or message text.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

export const LP_DB = "lp";
/**
 * Peer Navigation snapshot used as the source. `ecoach_a` and `ecoach_b` were
 * taken the same day; every data table is byte-identical (CHECKSUM TABLE), and
 * `ecoach_a` is the later one (newer admin access time and watchdog entries),
 * see docs/REWRITE_PLAN.md "Data migration".
 */
export const PN_DB = process.env.LEGACY_PN_DB || "ecoach_a";

export type Options = {
  only: Set<string> | null;
  skip: Set<string>;
  dryRun: boolean;
  skipFiles: boolean;
  verify: boolean;
};

export type TableStats = {
  /** Rows read from the legacy source(s). */
  source: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Source rows not migrated, by reason. */
  skipped: Record<string, number>;
  notes: string[];
};

export class Stats {
  readonly tables = new Map<string, TableStats>();

  get(name: string): TableStats {
    let entry = this.tables.get(name);
    if (!entry) {
      entry = { source: 0, inserted: 0, updated: 0, unchanged: 0, skipped: {}, notes: [] };
      this.tables.set(name, entry);
    }
    return entry;
  }

  source(name: string, count: number) {
    this.get(name).source += count;
  }

  skip(name: string, reason: string, count = 1) {
    if (!count) return;
    const entry = this.get(name);
    entry.skipped[reason] = (entry.skipped[reason] ?? 0) + count;
  }

  note(name: string, text: string) {
    this.get(name).notes.push(text);
  }

  written(name: string, result: { inserted: number; updated: number; unchanged: number }) {
    const entry = this.get(name);
    entry.inserted += result.inserted;
    entry.updated += result.updated;
    entry.unchanged += result.unchanged;
  }
}

export function createDb(url: string) {
  const client = postgres(url, { max: 4, onnotice: () => {} });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { client, db };
}

export type Db = ReturnType<typeof createDb>["db"];

export type Ctx = {
  db: Db;
  lp: Pool;
  pn: Pool;
  opts: Options;
  stats: Stats;
  log: (message: string) => void;
};

export function createLegacyPool(database: string) {
  const url = process.env.LEGACY_MYSQL_URL || "mysql://root:legacy@127.0.0.1:33067";
  return mysql.createPool({
    uri: url,
    database,
    connectionLimit: 4,
    charset: "utf8mb4",
    // Drupal stores unix timestamps as ints; keep MySQL DATETIME strings as
    // strings so wall-clock values are not shifted by the Node timezone.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
}

/** Runs a legacy query and returns plain row objects. */
export async function q<T = Record<string, unknown>>(pool: Pool, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

/** True when `table` exists in the pool's database. */
export async function tableExists(pool: Pool, table: string) {
  const rows = await q(pool, "select 1 from information_schema.tables where table_schema = database() and table_name = ?", [table]);
  return rows.length > 0;
}
