import "server-only";
import { and, sql, type AnyColumn, type SQL, type Table } from "drizzle-orm";
import { filterRange, type ReportFilters } from "../filters";
import { REPORT_TIMEZONE } from "../format";

/**
 * SQL building blocks shared by the report queries.
 *
 * The report timezone is a constant, so it is inlined as a literal rather
 * than bound as a parameter: Postgres only matches a SELECT expression with
 * its GROUP BY when both are textually identical, and two bound parameters
 * ($1, $2) never are.
 */
const ZONE = sql.raw(`'${REPORT_TIMEZONE.replaceAll("'", "''")}'`);

/**
 * `column = any($1::uuid[])`: the people in scope as one array parameter, so
 * the statement stays the same size however many people the report covers.
 * An empty list matches nothing.
 */
export function inIds(column: AnyColumn | SQL, ids: string[]): SQL {
  return sql`${column} = any(${sql.param(ids)}::uuid[])`;
}

/** `column` (a timestamptz) inside the filter's [start, end) range, or undefined for "all time". */
export function inRange(column: AnyColumn, filters: Pick<ReportFilters, "from" | "to">): SQL | undefined {
  const { start, end } = filterRange(filters);
  if (!start && !end) return undefined;
  return and(
    start ? sql`${column} >= ${start.toISOString()}::timestamptz` : undefined,
    end ? sql`${column} < ${end.toISOString()}::timestamptz` : undefined,
  );
}

/** `column` (a `date`, "yyyy-MM-dd") inside the filter's inclusive day range, or undefined. */
export function inDays(column: AnyColumn, filters: Pick<ReportFilters, "from" | "to">): SQL | undefined {
  if (!filters.from && !filters.to) return undefined;
  return and(
    filters.from ? sql`${column} >= ${filters.from}::date` : undefined,
    filters.to ? sql`${column} <= ${filters.to}::date` : undefined,
  );
}

/** Local calendar day ("yyyy-MM-dd") of a timestamptz in the report timezone. */
export function localDay(column: AnyColumn | SQL): SQL<string> {
  return sql<string>`to_char(${column} at time zone ${ZONE}, 'YYYY-MM-DD')`;
}

/** Monday ("yyyy-MM-dd") of the local week a timestamptz falls in (report timezone); matches `weekKey`. */
export function localWeek(column: AnyColumn | SQL): SQL<string> {
  return sql<string>`to_char(date_trunc('week', ${column} at time zone ${ZONE}), 'YYYY-MM-DD')`;
}

/**
 * `"table"."column"` for referring to an outer row inside a correlated subquery.
 * Drizzle leaves columns unqualified in single-table queries, where a bare
 * `"id"` inside the subquery would bind to the inner table instead.
 */
export function outerColumn(table: Table, column: string): SQL {
  return sql`${table}.${sql.identifier(column)}`;
}

/** `count(*)` as a JS number. */
export const countAll = () => sql<number>`count(*)::int`;

/** `count(*) filter (where …)` as a JS number. */
export const countWhere = (condition: SQL) => sql<number>`(count(*) filter (where ${condition}))::int`;

/** Map of `key → n` from grouped rows. */
export function countMap(rows: { key: string; n: number }[]) {
  return new Map(rows.map((row) => [row.key, row.n]));
}
