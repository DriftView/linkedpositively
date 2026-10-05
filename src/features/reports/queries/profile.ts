import "server-only";
import { and, eq, max, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { usageEvents } from "@/server/db/schema";
import { formatNumber, percent } from "../format";
import { countAll, inIds } from "./sql";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { eventCountReport } from "./shared";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";

export async function profileEditsReport(meta: ReportMeta, filters: ReportFilters) {
  const population = await studyPopulation(filters);
  return eventCountReport({
    meta,
    filters,
    population,
    type: "profile_edit",
    noun: "edits",
    chartTitle: "Profile edits per week",
    notes: [
      "Counts each saved change to a participant's profile: About me, badges, colour theme and Peer Navigation details. Avatar changes are in the avatar report.",
    ],
  });
}

export async function resourceViewsReport(meta: ReportMeta, filters: ReportFilters) {
  const population = await studyPopulation(filters);
  return eventCountReport({
    meta,
    filters,
    population,
    type: "resource_view",
    noun: "views",
    chartTitle: "Resource views per week",
    notes: [
      "Counts each time a participant opened a resource's details in the resource locator. Searches aren't counted.",
    ],
  });
}

const PHOTO = "Uploaded photo";

function avatarFile(eventMeta: unknown) {
  const meta = (eventMeta ?? {}) as { avatar?: string; photo?: boolean };
  if (meta.avatar) return `${meta.avatar}.png`;
  if (meta.photo) return PHOTO;
  return "";
}

/**
 * Standard User Profile Avatar Report (legacy ts_user_stats type
 * profile_avatar): the avatar each participant uses. The old table kept
 * only the first avatar ever chosen; the export now has the current one and
 * the screen shows the first one too.
 */
export async function avatarReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  // Per person: number of avatar changes, the first and the latest choice, and when it last changed.
  const history = await db
    .select({
      userId: usageEvents.userId,
      changes: countAll(),
      first: sql`(array_agg(${usageEvents.meta} order by ${usageEvents.at}, ${usageEvents.id}))[1]`.mapWith(
        usageEvents.meta,
      ),
      latest: sql`(array_agg(${usageEvents.meta} order by ${usageEvents.at} desc, ${usageEvents.id} desc))[1]`.mapWith(
        usageEvents.meta,
      ),
      changedAt: max(usageEvents.at),
    })
    .from(usageEvents)
    .where(and(inIds(usageEvents.userId, population.ids), eq(usageEvents.type, "profile_avatar")))
    .groupBy(usageEvents.userId);
  const historyOf = new Map(history.map((row) => [row.userId, row]));
  const rows = population.people
    .filter((p) => p.avatarId || p.photoKey || historyOf.has(p.id))
    .map((p) => {
      const h = historyOf.get(p.id);
      const current = p.photoKey ? PHOTO : p.avatarId ? `${p.avatarId}.png` : avatarFile(h?.latest);
      return {
        id: p.id,
        sid: p.sid,
        current,
        first: avatarFile(h?.first) || current,
        changes: h?.changes ?? 0,
        changedAt: h?.changedAt ? h.changedAt.toISOString() : null,
      };
    });
  const photos = rows.filter((r) => r.current === PHOTO).length;

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "current", label: "Avatar", kind: "text", hint: "Avatar File Name (the export's column)" },
        { id: "first", label: "First chosen", kind: "text", hint: "What the old report showed" },
        { id: "changes", label: "Changes", kind: "number" },
        { id: "changedAt", label: "Last changed", kind: "datetime" },
      ],
      rows,
      tiles: [
        {
          label: "With an avatar",
          value: formatNumber(rows.length),
          hint: `${percent(rows.length, population.people.length)} of ${formatNumber(population.people.length)}`,
        },
        { label: "Uploaded a photo", value: formatNumber(photos) },
        { label: "Changed it at least once", value: formatNumber(rows.filter((r) => r.changes > 0).length) },
        { label: "Changes in total", value: formatNumber(rows.reduce((s, r) => s + r.changes, 0)) },
      ],
      searchKeys: ["sid", "current", "first"],
      initialSort: { id: "changes", desc: true },
      notes: [
        "Library avatars are listed by file name (public/avatars/<name>.png); uploaded photos show as “Uploaded photo”.",
        "The export's “Avatar File Name” is the avatar in use today. The old report kept the first avatar ever chosen and never updated it; that value is in the “First chosen” column. This is a snapshot, so the date filter doesn't apply.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [["Participant SID", "Avatar File Name"], ...rows.map((r) => [r.sid, r.current])],
    },
  };
}
