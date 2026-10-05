import "server-only";
import { and, eq, max } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";
import { loginSessions, pointEntries, usageEvents } from "@/server/db/schema";
import { bucketByWeek, formatNumber, median, percent } from "../format";
import type { ReportFilters } from "../filters";
import type { ReportMeta } from "../catalog";
import type { Population } from "../population";
import type { ReportChart, ReportResult, ReportTile } from "../types";
import type { UsageType } from "@/server/services/usage";
import { countAll, inIds, inRange, localDay, localWeek } from "./sql";

/**
 * Distinct local days (report timezone) on which each person did anything
 * we record: signed in, a tracked page/feature view, or an action that
 * earned points (posting, commenting, check-ins, the daily time-on-site
 * credit…). Replaces the legacy `accesslog` page-hit table, which the new
 * app does not keep. `points: false` counts only sign-ins and tracked views,
 * so the days match the access totals they sit next to.
 */
export async function activeDays(
  ids: string[],
  filters: Pick<ReportFilters, "from" | "to">,
  { points: withPoints = true } = {},
) {
  const logins = db
    .select({ userId: loginSessions.userId, day: localDay(loginSessions.loginAt) })
    .from(loginSessions)
    .where(and(inIds(loginSessions.userId, ids), inRange(loginSessions.loginAt, filters)));
  const events = db
    .select({ userId: usageEvents.userId, day: localDay(usageEvents.at) })
    .from(usageEvents)
    .where(and(inIds(usageEvents.userId, ids), inRange(usageEvents.at, filters)));
  const points = db
    .select({ userId: pointEntries.userId, day: localDay(pointEntries.at) })
    .from(pointEntries)
    .where(and(inIds(pointEntries.userId, ids), inRange(pointEntries.at, filters)));
  // UNION (not UNION ALL) leaves one row per person and day.
  const rows = withPoints ? await union(logins, events, points) : await union(logins, events);
  const days = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!days.has(row.userId)) days.set(row.userId, new Set());
    days.get(row.userId)!.add(row.day);
  }
  return days;
}

/** Tiles every per-participant count report shares. */
export function countTiles(counts: number[], population: number, noun: string): ReportTile[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  const active = counts.filter((n) => n > 0);
  const mid = median(active);
  return [
    { label: `Total ${noun}`, value: formatNumber(total) },
    {
      label: "Participants",
      value: formatNumber(active.length),
      hint: `${percent(active.length, population)} of ${formatNumber(population)} in scope`,
    },
    { label: "Median per participant", value: mid === null ? "—" : formatNumber(mid, 1), hint: "Among those with any" },
    { label: "Most by one participant", value: active.length ? formatNumber(Math.max(...active)) : "—" },
  ];
}

/** Single-series weekly bar chart from per-week counts (`week` = Monday "yyyy-MM-dd", see `localWeek`). */
export function weeklyChart(
  weeks: { week: string; n: number }[],
  filters: ReportFilters,
  title: string,
  seriesLabel: string,
): ReportChart | undefined {
  const data = bucketByWeek(
    weeks.map((w) => ({ week: w.week, series: "count" as const, count: w.n })),
    ["count"],
    { from: filters.from, to: filters.to },
  );
  if (data.length < 2) return undefined;
  return { title, series: [{ key: "count", label: seriesLabel, color: "primary" }], data, labelPrefix: "Week of" };
}

/**
 * "Participant SID, Count" reports over one usage-event type (tracker page
 * views, resource views, profile edits, content-warning clicks). Legacy
 * source: `ts_user_stats` counters; rows only for people with a count.
 */
export async function eventCountReport(opts: {
  meta: ReportMeta;
  filters: ReportFilters;
  population: Population;
  type: UsageType;
  noun: string;
  chartTitle: string;
  notes: string[];
}): Promise<ReportResult> {
  const { meta, filters, population } = opts;
  const where = and(
    inIds(usageEvents.userId, population.ids),
    eq(usageEvents.type, opts.type),
    inRange(usageEvents.at, filters),
  );
  const week = localWeek(usageEvents.at);
  const [perUser, perWeek] = await Promise.all([
    db
      .select({ userId: usageEvents.userId, n: countAll(), last: max(usageEvents.at) })
      .from(usageEvents)
      .where(where)
      .groupBy(usageEvents.userId),
    db.select({ week, n: countAll() }).from(usageEvents).where(where).groupBy(week).orderBy(week),
  ]);
  const counts = new Map(perUser.map((row) => [row.userId, { n: row.n, last: row.last! }]));
  const rows = population.people
    .filter((p) => counts.has(p.id))
    .map((p) => ({ id: p.id, sid: p.sid, count: counts.get(p.id)!.n, last: counts.get(p.id)!.last.toISOString() }))
    .sort((a, b) => b.count - a.count || a.sid.localeCompare(b.sid));

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "count", label: "Count", kind: "number" },
        { id: "last", label: "Most recent", kind: "datetime" },
      ],
      rows,
      tiles: countTiles(
        rows.map((r) => r.count),
        population.people.length,
        opts.noun,
      ),
      chart: weeklyChart(perWeek, filters, opts.chartTitle, opts.noun[0].toUpperCase() + opts.noun.slice(1)),
      searchKeys: ["sid"],
      initialSort: { id: "count", desc: true },
      notes: opts.notes,
      missingSid: population.missingSid,
    },
    csv: { filename: meta.filename, rows: [["Participant SID", "Count"], ...rows.map((r) => [r.sid, r.count])] },
  };
}
