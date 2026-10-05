import "server-only";
import { and, desc, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { loginSessions } from "@/server/db/schema";
import { deviceSummary } from "@/features/peer-nav/format";
import {
  bucketByWeek,
  flatText,
  formatNumber,
  clockDuration,
  legacyDateTime,
  legacyDuration,
  median,
  percent,
  sessionSeconds,
  weekKey,
} from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";
import { inIds, inRange } from "./sql";

/**
 * Standard Usage Report (legacy uy_standard_usage_report): one row per Link
 * Positively sign-in, newest first.
 */
export async function usageReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const sessions = await db
    .select({
      id: loginSessions.id,
      userId: loginSessions.userId,
      loginAt: loginSessions.loginAt,
      logoutAt: loginSessions.logoutAt,
      userAgent: loginSessions.userAgent,
    })
    .from(loginSessions)
    .where(
      and(
        inIds(loginSessions.userId, population.ids),
        ne(loginSessions.program, "peernav"),
        inRange(loginSessions.loginAt, filters),
      ),
    )
    .orderBy(desc(loginSessions.loginAt), desc(loginSessions.id));

  const rows = sessions.map((s) => {
    const person = population.byId.get(s.userId)!;
    const seconds = sessionSeconds(s.loginAt, s.logoutAt);
    return {
      id: s.id,
      sid: person.sid,
      loginAt: s.loginAt.toISOString(),
      device: deviceSummary(s.userAgent ?? ""),
      userAgent: flatText(s.userAgent),
      duration: seconds,
    };
  });

  const closed = rows.map((r) => r.duration).filter((d): d is number => d !== null);
  const incomplete = rows.length - closed.length;
  const people = new Set(rows.map((r) => r.sid)).size;
  const mid = median(closed);

  const chartData = bucketByWeek(
    rows.map((r) => ({
      week: weekKey(r.loginAt),
      series: r.duration === null ? ("incomplete" as const) : ("closed" as const),
    })),
    ["closed", "incomplete"],
    { from: filters.from, to: filters.to },
  );

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "loginAt", label: "Signed in", kind: "datetime", hint: "Login Date and Time" },
        {
          id: "device",
          label: "Device",
          kind: "text",
          hint: "Summarised from the browser's User-Agent; the export has the full string.",
        },
        { id: "duration", label: "Session length", kind: "duration", hint: "Total Session Duration" },
      ],
      rows,
      tiles: [
        { label: "Sessions", value: formatNumber(rows.length) },
        {
          label: "Participants signed in",
          value: formatNumber(people),
          hint: `${percent(people, population.people.length)} of ${formatNumber(population.people.length)} in scope`,
        },
        {
          label: "Median session",
          value: mid === null ? "—" : clockDuration(Math.round(mid)),
          hint: "Sessions with a sign-out",
        },
        {
          label: "Incomplete",
          value: percent(incomplete, rows.length),
          hint: `${formatNumber(incomplete)} with no sign-out recorded`,
          tone: rows.length && incomplete / rows.length > 0.5 ? "warning" : "default",
        },
      ],
      chart:
        chartData.length > 1
          ? {
              title: "Sign-ins per week",
              description: "Split by whether the participant signed out.",
              series: [
                { key: "closed", label: "Signed out", color: "chart-1" },
                { key: "incomplete", label: "Incomplete", color: "chart-4" },
              ],
              data: chartData,
              labelPrefix: "Week of",
            }
          : undefined,
      searchKeys: ["sid", "device"],
      initialSort: { id: "loginAt", desc: true },
      notes: [
        "One row per sign-in to Link Positively (Peer Navigation sign-ins are in the Peer Navigation usage report).",
        "Session length is sign-out minus sign-in. Most people close the tab instead of signing out, so those sessions show “Incomplete” rather than a made-up length. The old report printed nonsense durations for them and dropped whole hours or minutes that happened to be zero.",
        "Times are Eastern (the old server's timezone), formatted MM.DD.YYYY HH:MM:SS in the export.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        ["Participant SID", "Login Date and Time", "Type of Device Used", "Total Session Duration"],
        ...rows.map((r) => [r.sid, legacyDateTime(r.loginAt), r.userAgent, legacyDuration(r.duration)]),
      ],
    },
  };
}
