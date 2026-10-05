import { z } from "zod";

/**
 * Row ids are UUIDs (Postgres `uuid`, default gen_random_uuid()). Client-safe:
 * no server imports, so forms and Zod schemas can use these too.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a syntactically valid UUID (replaces Mongoose's
 * `isValidObjectId`). Check ids from URLs and forms with this before querying:
 * Postgres rejects a malformed uuid with an error instead of returning no rows.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** A new random id, for when the app needs the id before inserting. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Zod schema for an id field (replaces the old 24-hex `objectIdSchema`). */
export const uuidSchema = z.string().regex(UUID_RE, "Invalid id");
