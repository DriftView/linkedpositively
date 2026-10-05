import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// One connection pool per process, reused across hot reloads in dev and across
// invocations in serverless runtimes.
const globalForDb = globalThis as unknown as { __pgClient?: postgres.Sql };

/**
 * The raw postgres.js client. Prefer `db`; use this only for things Drizzle
 * can't express (e.g. LISTEN/NOTIFY). Behind a transaction-mode pooler
 * (PgBouncer, Supabase/Neon pooled URLs) add `prepare: false`.
 */
export const pgClient = (globalForDb.__pgClient ??= postgres(env.DATABASE_URL, {
  max: 10,
  // Keep the logs quiet about "relation already exists, skipping" etc.
  onnotice: () => {},
}));

/** The Drizzle database. Column names are snake_case in SQL, camelCase in TS. */
export const db = drizzle({ client: pgClient, schema, casing: "snake_case" });

export type Db = typeof db;
/** A transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the database or a transaction: for helpers that can run inside or outside one. */
export type Executor = Db | Tx;

/**
 * Runs `fn` in a transaction: everything commits together or nothing does
 * (any throw rolls back). Use when a write touches several tables and must be
 * all-or-nothing. Pass `tx` (not `db`) to every query inside.
 */
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
