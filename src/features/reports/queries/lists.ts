import "server-only";
import { and, desc, eq, max, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { comments as commentsTable, resourceRatings, resources, tips } from "@/server/db/schema";
import { formatNumber } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { countTiles, weeklyChart } from "./shared";
import { countAll, inIds, inRange, localWeek, outerColumn } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";

/** Comment text on one line; commas are kept (the export quotes them). */
function oneLine(text: string | null | undefined) {
  return (text ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/**
 * Thrive Tip / resource comments per participant (legacy thrive_tips.inc,
 * View all_user_comments): "Participant SID, Count, Comments", with every
 * comment in its own trailing column, newest first.
 */
export async function commentsReport(
  meta: ReportMeta,
  filters: ReportFilters,
  target: "tip" | "resource",
): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  // Only comments on content that is still live (legacy: published tips/resources).
  const targetId = outerColumn(commentsTable, "target_id");
  const live =
    target === "tip"
      ? sql`exists (select 1 from ${tips} where ${tips.id} = ${targetId} and ${tips.published})`
      : sql`exists (select 1 from ${resources} where ${resources.id} = ${targetId} and ${resources.status} = 'published')`;
  const where = and(
    eq(commentsTable.targetType, target),
    live,
    inIds(commentsTable.authorId, population.ids),
    inRange(commentsTable.createdAt, filters),
  );
  const week = localWeek(commentsTable.createdAt);
  const [perAuthor, perWeek] = await Promise.all([
    // Each participant's comments, newest first.
    db
      .select({
        authorId: sql<string>`${commentsTable.authorId}`,
        texts: sql<
          string[]
        >`array_agg(${commentsTable.bodyText} order by ${commentsTable.createdAt} desc, ${commentsTable.id} desc)`,
        last: max(commentsTable.createdAt),
      })
      .from(commentsTable)
      .where(where)
      .groupBy(commentsTable.authorId),
    db.select({ week, n: countAll() }).from(commentsTable).where(where).groupBy(week).orderBy(week),
  ]);

  const byAuthor = new Map(perAuthor.map((row) => [row.authorId, { texts: row.texts.map(oneLine), last: row.last! }]));
  const rows = population.people
    .filter((p) => byAuthor.has(p.id))
    .map((p) => {
      const entry = byAuthor.get(p.id)!;
      return { id: p.id, sid: p.sid, count: entry.texts.length, comments: entry.texts, last: entry.last.toISOString() };
    });
  const noun = target === "tip" ? "tip" : "resource";

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "count", label: "Comments", kind: "number", hint: "Count" },
        { id: "last", label: "Most recent", kind: "datetime" },
        { id: "comments", label: "What they wrote", kind: "list", hint: "Comments, newest first" },
      ],
      rows,
      tiles: countTiles(
        rows.map((r) => r.count),
        population.people.length,
        "comments",
      ),
      chart: weeklyChart(perWeek, filters, `Comments on ${noun}s per week`, "Comments"),
      searchKeys: ["sid", "comments"],
      initialSort: { id: "count", desc: true },
      notes: [
        `Comments participants left on published ${noun}s, grouped by participant, newest first.`,
        "In the export each comment sits in its own column after the count, as before. Commas and accents are now kept intact (the old file stripped non-English characters and let commas split comments across columns).",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [["Participant SID", "Count", "Comments"], ...rows.map((r) => [r.sid, r.count, ...r.comments])],
    },
  };
}

/**
 * Standard User Resource Ratings Report (legacy View resource_rating): the
 * published resources each participant rated.
 */
export async function ratingsReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  // Ratings of published resources per participant, most recently rated first.
  const order = sql`${resourceRatings.updatedAt} desc, ${resourceRatings.id} desc`;
  const rated = await db
    .select({
      userId: resourceRatings.userId,
      count: countAll(),
      sum: sql<number>`sum(${resourceRatings.value})::int`,
      titles: sql<string[]>`array_agg(${resources.title} order by ${order})`,
      values: sql<number[]>`array_agg(${resourceRatings.value} order by ${order})`,
    })
    .from(resourceRatings)
    .innerJoin(resources, and(eq(resources.id, resourceRatings.resourceId), eq(resources.status, "published")))
    .where(and(inIds(resourceRatings.userId, population.ids), inRange(resourceRatings.updatedAt, filters)))
    .groupBy(resourceRatings.userId);

  const byUser = new Map(rated.map((row) => [row.userId, row]));
  const rows = population.people
    .filter((p) => byUser.has(p.id))
    .map((p) => {
      const entry = byUser.get(p.id)!;
      return {
        id: p.id,
        sid: p.sid,
        count: entry.count,
        average: Math.round((entry.sum / entry.count) * 10) / 10,
        resources: entry.titles.map((title, i) => `${title} · ${entry.values[i]}★`),
        titles: entry.titles,
      };
    });

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "count", label: "Resources rated", kind: "number", hint: "Count" },
        { id: "average", label: "Average stars", kind: "number" },
        { id: "resources", label: "Resources", kind: "list", hint: "content" },
      ],
      rows: rows.map((row) => ({
        id: row.id,
        sid: row.sid,
        count: row.count,
        average: row.average,
        resources: row.resources,
      })),
      tiles: countTiles(
        rows.map((r) => r.count),
        population.people.length,
        "ratings",
      ),
      searchKeys: ["sid", "resources"],
      initialSort: { id: "count", desc: true },
      notes: [
        "Published resources each participant rated. The export keeps the old layout (titles only, one per column); the stars are shown here for context.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [["Participant SID", "Count", "content"], ...rows.map((r) => [r.sid, r.count, ...r.titles])],
    },
  };
}

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  suggested: "Waiting for review",
  unpublished: "Not published",
};

/**
 * Standard User Submitted Resources Report (legacy View
 * resource_content_by_users): resources participants suggested.
 */
export async function submittedResourcesReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const submitted = await db
    .select({
      id: resources.id,
      title: resources.title,
      status: resources.status,
      suggestedBy: resources.suggestedBy,
      authorId: resources.authorId,
      createdAt: resources.createdAt,
      city: resources.city,
    })
    .from(resources)
    .where(
      and(
        or(inIds(resources.suggestedBy, population.ids), inIds(resources.authorId, population.ids)),
        inRange(resources.createdAt, filters),
      ),
    )
    .orderBy(desc(resources.createdAt), desc(resources.id));
  const rows = submitted.flatMap((resource) => {
    const by = resource.suggestedBy ?? resource.authorId;
    const person = by ? population.byId.get(by) : undefined;
    if (!person) return [];
    return [
      {
        id: resource.id,
        sid: person.sid,
        title: resource.title,
        city: resource.city ?? "",
        status: STATUS_LABELS[resource.status] ?? resource.status,
        createdAt: resource.createdAt.toISOString(),
      },
    ];
  });
  const published = rows.filter((r) => r.status === "Published").length;

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "title", label: "Title", kind: "text" },
        { id: "city", label: "City", kind: "text" },
        { id: "status", label: "Status", kind: "text" },
        { id: "createdAt", label: "Submitted", kind: "date" },
      ],
      rows,
      tiles: [
        { label: "Resources submitted", value: formatNumber(rows.length) },
        { label: "By participants", value: formatNumber(new Set(rows.map((r) => r.sid)).size) },
        { label: "Published", value: formatNumber(published) },
        {
          label: "Waiting for review",
          value: formatNumber(rows.filter((r) => r.status === "Waiting for review").length),
        },
      ],
      searchKeys: ["sid", "title", "city", "status"],
      initialSort: { id: "createdAt", desc: true },
      notes: [
        "Every resource a participant suggested, newest first. The old report only listed suggestions staff had already published; the status column shows where each one stands, and the export keeps the old two columns.",
      ],
      missingSid: population.missingSid,
    },
    csv: { filename: meta.filename, rows: [["Participant SID", "Title"], ...rows.map((r) => [r.sid, r.title])] },
  };
}
