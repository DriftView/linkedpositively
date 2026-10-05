import "server-only";
import { max } from "drizzle-orm";
import { db } from "@/server/db/client";
import { loginSessions, usageEvents } from "@/server/db/schema";
import { daysBetween, formatNumber, legacySlashDate } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";
import { inIds } from "./sql";

/**
 * Study Management Report (legacy Views export
 * engagement_report_for_study_management): active participants with their
 * account age and time since they were last seen, newest accounts first.
 */
export async function studyManagementReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const people = population.people.filter((p) => !p.banned);
  const ids = people.map((p) => p.id);
  const [logins, events] = await Promise.all([
    db
      .select({ userId: loginSessions.userId, last: max(loginSessions.loginAt) })
      .from(loginSessions)
      .where(inIds(loginSessions.userId, ids))
      .groupBy(loginSessions.userId),
    db
      .select({ userId: usageEvents.userId, last: max(usageEvents.at) })
      .from(usageEvents)
      .where(inIds(usageEvents.userId, ids))
      .groupBy(usageEvents.userId),
  ]);
  const lastLogin = new Map(logins.map((r) => [r.userId, r.last]));
  const lastEvent = new Map(events.map((r) => [r.userId, r.last]));
  const now = new Date();

  const rows = people
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((person) => {
      const login = lastLogin.get(person.id) ?? null;
      const seen = [login, lastEvent.get(person.id), person.lastActiveAt].filter((d): d is Date => Boolean(d));
      const lastSeen = seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null;
      return {
        id: person.id,
        sid: person.sid,
        username: person.username,
        createdAt: person.createdAt?.toISOString() ?? null,
        lastLogin: login?.toISOString() ?? null,
        lastSeen: lastSeen?.toISOString() ?? null,
        sinceSeen: lastSeen ? daysBetween(lastSeen, now) : null,
        sinceCreated: person.createdAt ? daysBetween(person.createdAt, now) : 0,
        started: person.interventionStartDate?.toISOString() ?? null,
      };
    });

  const quiet = (days: number) => rows.filter((r) => r.sinceSeen === null || r.sinceSeen > days).length;

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Study ID", kind: "sid", sticky: true },
        { id: "username", label: "Username", kind: "text" },
        { id: "createdAt", label: "Account created", kind: "date", hint: "user created" },
        { id: "started", label: "Intervention start", kind: "date" },
        { id: "lastLogin", label: "Last sign-in", kind: "date", hint: "last login" },
        { id: "lastSeen", label: "Last active", kind: "datetime" },
        {
          id: "sinceSeen",
          label: "Days since active",
          kind: "heat",
          hint: "days since last login (counted from last activity, as before)",
        },
        { id: "sinceCreated", label: "Days since created", kind: "number", hint: "days since created" },
      ],
      rows,
      tiles: [
        { label: "Active participants", value: formatNumber(rows.length), hint: "Accounts that aren't blocked" },
        { label: "Active this week", value: formatNumber(rows.length - quiet(7)) },
        { label: "Quiet for 14+ days", value: formatNumber(quiet(14)), tone: quiet(14) ? "warning" : "default" },
        { label: "Never seen", value: formatNumber(rows.filter((r) => r.sinceSeen === null).length) },
      ],
      searchKeys: ["sid", "username"],
      initialSort: { id: "createdAt", desc: true },
      notes: [
        "Blocked accounts are left out, as before. This is a snapshot of today, so the date filter doesn't apply.",
        "“Days since last login” in the export is counted from the last time the participant did anything (as the old site did with its last-access time); “last login” is the last actual sign-in. People never seen get 0, as before.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        ["study ID", "user created", "last login", "days since last login", "days since created"],
        ...rows.map((r) => [
          r.sid,
          legacySlashDate(r.createdAt),
          legacySlashDate(r.lastLogin),
          r.sinceSeen ?? 0,
          r.sinceCreated,
        ]),
      ],
    },
  };
}
