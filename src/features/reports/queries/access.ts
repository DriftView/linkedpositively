import "server-only";
import { and } from "drizzle-orm";
import { db } from "@/server/db/client";
import { loginSessions, usageEvents } from "@/server/db/schema";
import { primaryRoleLabel } from "@/server/auth/roles";
import { bucketByWeek, formatNumber, median, percent, weekKeyOfDay } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { activeDays } from "./shared";
import { countAll, countMap, inIds, inRange } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";

/**
 * System access by week (legacy access_report, which was HTML only): per
 * person, how much they used the app in the date range and on how many days.
 * The old page counted raw page hits from Drupal's access log; the new app
 * records sign-ins and feature views instead, so this counts those.
 */
export async function accessReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters, { requireSid: meta.requireSid });
  const [logins, events, days] = await Promise.all([
    db
      .select({ key: loginSessions.userId, n: countAll() })
      .from(loginSessions)
      .where(and(inIds(loginSessions.userId, population.ids), inRange(loginSessions.loginAt, filters)))
      .groupBy(loginSessions.userId),
    db
      .select({ key: usageEvents.userId, n: countAll() })
      .from(usageEvents)
      .where(and(inIds(usageEvents.userId, population.ids), inRange(usageEvents.at, filters)))
      .groupBy(usageEvents.userId),
    activeDays(population.ids, filters, { points: false }),
  ]);
  const loginsOf = countMap(logins);
  const eventsOf = countMap(events);

  const rows = population.people
    .map((person) => {
      const signIns = loginsOf.get(person.id) ?? 0;
      const views = eventsOf.get(person.id) ?? 0;
      return {
        id: person.id,
        username: person.username,
        sid: person.sid,
        role: primaryRoleLabel(person.roles),
        signIns,
        views,
        total: signIns + views,
        days: days.get(person.id)?.size ?? 0,
      };
    })
    .filter((row) => row.total > 0 || row.days > 0)
    .sort((a, b) => b.days - a.days || b.total - a.total);

  // Distinct active people per week, from their active days.
  const perWeek = new Map<string, Set<string>>();
  for (const [userId, set] of days) {
    for (const day of set) {
      const week = weekKeyOfDay(day);
      if (!perWeek.has(week)) perWeek.set(week, new Set());
      perWeek.get(week)!.add(userId);
    }
  }
  const items = [...perWeek].flatMap(([week, users]) => [...users].map(() => ({ week, series: "people" as const })));
  const chartData = bucketByWeek(items, ["people"], { from: filters.from, to: filters.to });
  const mid = median(rows.map((r) => r.days));

  return {
    view: {
      layout: "table",
      columns: [
        { id: "username", label: "User", kind: "text", sticky: true },
        { id: "sid", label: "Study ID", kind: "sid" },
        { id: "role", label: "Role", kind: "text" },
        { id: "signIns", label: "Sign-ins", kind: "number" },
        {
          id: "views",
          label: "Feature views",
          kind: "number",
          hint: "Tracked page and feature views (wall, tips, trackers, resources…)",
        },
        { id: "total", label: "Total access", kind: "heat", hint: "Sign-ins plus feature views" },
        { id: "days", label: "Days with access", kind: "heat" },
      ],
      rows,
      tiles: [
        {
          label: "People with access",
          value: formatNumber(rows.length),
          hint: `${percent(rows.length, population.people.length)} of ${formatNumber(population.people.length)} in scope`,
        },
        { label: "Total access", value: formatNumber(rows.reduce((s, r) => s + r.total, 0)) },
        { label: "Median active days", value: mid === null ? "—" : formatNumber(mid, 1) },
        { label: "Sign-ins", value: formatNumber(rows.reduce((s, r) => s + r.signIns, 0)) },
      ],
      chart:
        chartData.length > 1
          ? {
              title: "Active people per week",
              description: "Distinct people with any recorded activity that week.",
              series: [{ key: "people", label: "People", color: "primary" }],
              data: chartData,
              labelPrefix: "Week of",
            }
          : undefined,
      searchKeys: ["username", "sid", "role"],
      initialSort: { id: "days", desc: true },
      notes: [
        "Covers everyone who signed in, staff included, unless you pick a study arm. The old page listed usernames only; the study ID is added here.",
        "The old report counted every page request in Drupal's access log. The new app doesn't keep a raw access log, so “Total access” is sign-ins plus tracked feature views, and “Days with access” counts the Eastern calendar days with at least one of them.",
        "The old date range silently left out the end date. Both ends are included here.",
      ],
      gaps: [
        {
          label: "Every page request",
          detail:
            "Visits to pages without their own tracking (profiles, single posts, journey, leaderboard, levels, notifications, support and most Peer Navigation pages) aren’t recorded, so totals run lower than the old page-hit counts.",
        },
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        ["USER", "STUDY_ID", "SIGN_INS", "FEATURE_VIEWS", "RESOURCE_ACCESS_TOTAL", "DAYS_WITH_RESOURCE_ACCESS"],
        ...rows.map((r) => [r.username, r.sid, r.signIns, r.views, r.total, r.days]),
      ],
    },
  };
}
