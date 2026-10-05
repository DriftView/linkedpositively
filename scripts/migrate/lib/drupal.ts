import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Pool } from "mysql2/promise";
import { q } from "./context";

/** Drupal unix seconds → Date (null for 0/empty). */
export function ts(value: unknown): Date | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

/** Calendar day ("yyyy-MM-dd") of a unix timestamp in a timezone. */
export function dayOf(value: unknown, timezone: string) {
  const date = ts(value);
  return date ? format(new TZDate(date.getTime(), timezone), "yyyy-MM-dd") : null;
}

/**
 * Midnight of a wall-clock date ("2024-03-05" or "2024-03-05 00:00:00",
 * Drupal datetime fields with tz_handling none) in a timezone.
 */
export function localMidnight(value: unknown, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(new TZDate(Number(y), Number(m) - 1, Number(d), 0, 0, 0, timezone).getTime());
}

/** A wall-clock datetime string ("2024-03-05 14:30:00") interpreted in a timezone. */
export function localDateTime(value: unknown, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value ?? ""));
  if (!match) return localMidnight(value, timezone);
  const [, y, mo, d, h, mi, s] = match;
  return new Date(new TZDate(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0), timezone).getTime());
}

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  return text.trim() === "" ? null : text;
}

export function int(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Field values per entity: `field_x` → values ordered by delta. */
export type FieldValues = Map<number, Record<string, Record<string, unknown>[]>>;

/**
 * Loads Drupal field values (`field_data_<name>`) for one entity type and
 * bundle(s). Each value is the row's `<field>_<column>` columns with the
 * prefix stripped, e.g. `{ value, format }`, `{ target_id }`, `{ fid, alt }`.
 */
export async function loadFields(pool: Pool, entityType: string, bundles: string[] | null, fields: string[]) {
  const out: FieldValues = new Map();
  for (const field of fields) {
    const exists = await q(pool, "select 1 from information_schema.tables where table_schema = database() and table_name = ?", [
      `field_data_${field}`,
    ]);
    if (!exists.length) continue;
    const where = bundles ? `and bundle in (${bundles.map(() => "?").join(",")})` : "";
    const rows = await q(
      pool,
      `select * from \`field_data_${field}\` where entity_type = ? and deleted = 0 ${where} order by entity_id, delta`,
      [entityType, ...(bundles ?? [])],
    );
    const prefix = `${field}_`;
    for (const row of rows) {
      const id = Number(row.entity_id);
      const value: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(row)) if (key.startsWith(prefix)) value[key.slice(prefix.length)] = v;
      let entity = out.get(id);
      if (!entity) out.set(id, (entity = {}));
      (entity[field] ??= []).push(value);
    }
  }
  return out;
}

/** First value's column of a field, e.g. `fv(values, id, "field_city")`. */
export function fv(values: FieldValues, id: number, field: string, column = "value"): unknown {
  return values.get(id)?.[field]?.[0]?.[column] ?? null;
}

export function fvAll(values: FieldValues, id: number, field: string, column = "value"): unknown[] {
  return (values.get(id)?.[field] ?? []).map((value) => value[column]).filter((v) => v !== null && v !== undefined);
}

// ---------------------------------------------------------------------------
// PHP unserialize (Drupal stores variables, form states and counters with it)

export function phpUnserialize(input: string | Buffer | null | undefined): unknown {
  if (input === null || input === undefined) return null;
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  let pos = 0;
  const readUntil = (ch: string) => {
    const end = buf.indexOf(ch, pos);
    if (end < 0) throw new Error("php unserialize: unexpected end");
    const out = buf.toString("utf8", pos, end);
    pos = end + 1;
    return out;
  };
  const parse = (): unknown => {
    const type = String.fromCharCode(buf[pos]);
    pos += 2; // "x:"
    switch (type) {
      case "N":
        return null;
      case "b":
        return readUntil(";") === "1";
      case "i":
        return Number(readUntil(";"));
      case "d":
        return Number(readUntil(";"));
      case "s": {
        const length = Number(readUntil(":"));
        pos += 1; // opening quote
        const value = buf.toString("utf8", pos, pos + length);
        pos += length + 2; // closing quote + ;
        return value;
      }
      case "a": {
        const count = Number(readUntil(":"));
        pos += 1; // {
        const entries: [string | number, unknown][] = [];
        for (let i = 0; i < count; i++) {
          const key = parse() as string | number;
          entries.push([key, parse()]);
        }
        pos += 1; // }
        return Object.fromEntries(entries);
      }
      case "O": {
        readUntil(":"); // class name length
        readUntil(":"); // "ClassName"
        const count = Number(readUntil(":"));
        pos += 1;
        const entries: [string, unknown][] = [];
        for (let i = 0; i < count; i++) {
          const key = String(parse()).replace(/^\0.*?\0/, "");
          entries.push([key, parse()]);
        }
        pos += 1;
        return Object.fromEntries(entries);
      }
      default:
        throw new Error(`php unserialize: unsupported type ${type}`);
    }
  };
  try {
    return parse();
  } catch {
    return null;
  }
}

/** Drupal `variable` value by name (unserialized). */
export async function variable(pool: Pool, name: string): Promise<unknown> {
  const rows = await q<{ value: Buffer }>(pool, "select value from variable where name = ?", [name]);
  return rows.length ? phpUnserialize(rows[0].value) : undefined;
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Decodes the HTML entities Drupal's `entities()` and check_plain wrote into plain text. */
export function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
