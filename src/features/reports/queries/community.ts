import "server-only";
import { and, desc, eq, isNotNull, max, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { comments as commentsTable, posts as postsTable, reactions, type Photo } from "@/server/db/schema";
import { bucketByWeek, flatText, formatNumber, legacyDateTime, percent, weekKey } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { countTiles, eventCountReport, weeklyChart } from "./shared";
import { countAll, countWhere, inIds, inRange, localWeek, outerColumn } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";

/** A post or comment id as the old reports printed it: the Drupal id when migrated. */
function legacyId(row: { id: string; legacyId: number | null }) {
  return row.legacyId ? String(row.legacyId) : row.id;
}

/** Body + photo + video, flattened to one line like the legacy report. */
function exportBody(
  kind: "post" | "comment",
  row: { id: string; bodyText: string | null; photo: Photo | null; videoId: string | null },
) {
  const parts = [flatText(row.bodyText)];
  if (row.photo?.key) parts.push(`/api/community/media/${kind}/${row.id}`);
  if (row.videoId) parts.push(`https://www.youtube.com/watch?v=${row.videoId}`);
  return parts.filter(Boolean).join(" ");
}

/** Reactions on a post or comment (correlated subquery on reactions_target_created_idx). */
function reactionCount(targetType: "post" | "comment") {
  const target = targetType === "post" ? outerColumn(postsTable, "id") : outerColumn(commentsTable, "id");
  return sql<number>`(select count(*)::int from ${reactions} where ${reactions.targetType} = ${targetType} and ${reactions.targetId} = ${target})`;
}

export type ThreadComment = {
  id: string;
  legacyId: string;
  sid: string;
  createdAt: string;
  body: string;
  hasPhoto: boolean;
  hasVideo: boolean;
  reactions: number;
};
export type Thread = {
  id: string;
  legacyId: string;
  sid: string;
  createdAt: string;
  headline: string | null;
  body: string;
  hasPhoto: boolean;
  hasVideo: boolean;
  reactions: number;
  comments: ThreadComment[];
};

/** Posts shown on screen; the export always has every thread. */
export const THREAD_SCREEN_LIMIT = 150;

/**
 * Standard User Interaction Report (legacy uy_user_interaction_report): a
 * thread dump of participants' wall posts, each followed by its replies
 * from people with a study ID, newest first.
 */
export async function interactionReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const postWhere = and(
    inIds(postsTable.authorId, population.ids),
    eq(postsTable.kind, "post"),
    inRange(postsTable.createdAt, filters),
  );
  const [posts, comments] = await Promise.all([
    db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        bodyText: postsTable.bodyText,
        headline: postsTable.headline,
        photo: postsTable.photo,
        videoId: postsTable.videoId,
        createdAt: postsTable.createdAt,
        legacyId: postsTable.legacyId,
        reactions: reactionCount("post"),
      })
      .from(postsTable)
      .where(postWhere)
      .orderBy(desc(postsTable.createdAt), desc(postsTable.id)),
    // Replies to those posts from people in scope.
    db
      .select({
        id: commentsTable.id,
        targetId: commentsTable.targetId,
        authorId: commentsTable.authorId,
        bodyText: commentsTable.bodyText,
        photo: commentsTable.photo,
        videoId: commentsTable.videoId,
        createdAt: commentsTable.createdAt,
        legacyId: commentsTable.legacyId,
        reactions: reactionCount("comment"),
      })
      .from(commentsTable)
      .innerJoin(postsTable, eq(postsTable.id, commentsTable.targetId))
      .where(and(eq(commentsTable.targetType, "post"), postWhere, inIds(commentsTable.authorId, population.ids)))
      .orderBy(desc(commentsTable.createdAt), desc(commentsTable.id)),
  ]);

  const commentsOf = new Map<string, typeof comments>();
  for (const comment of comments) {
    const key = comment.targetId;
    if (!commentsOf.has(key)) commentsOf.set(key, []);
    commentsOf.get(key)!.push(comment);
  }
  const sidOf = (id: string | null) => (id ? (population.byId.get(id)?.sid ?? "") : "");

  const threads: Thread[] = posts.map((post) => ({
    id: post.id,
    legacyId: legacyId(post),
    sid: sidOf(post.authorId),
    createdAt: post.createdAt.toISOString(),
    headline: post.headline ?? null,
    body: post.bodyText ?? "",
    hasPhoto: Boolean(post.photo?.key),
    hasVideo: Boolean(post.videoId),
    reactions: post.reactions,
    comments: (commentsOf.get(post.id) ?? []).map((c) => ({
      id: c.id,
      legacyId: legacyId(c),
      sid: sidOf(c.authorId),
      createdAt: c.createdAt.toISOString(),
      body: c.bodyText ?? "",
      hasPhoto: Boolean(c.photo?.key),
      hasVideo: Boolean(c.videoId),
      reactions: c.reactions,
    })),
  }));

  const csvRows: (string | number)[][] = [
    [
      "Date of Post",
      "Post ID",
      "Original Post Content",
      "Participant SID of Original Post",
      "Post Reactions Count",
      "Date of Comment",
      "Parent Post ID",
      "Content of Replies to the Original Post",
      "Participant SID of Each Reply",
      "Comment Reactions Count",
    ],
  ];
  const postById = new Map(posts.map((p) => [p.id, p]));
  for (const thread of threads) {
    csvRows.push([
      legacyDateTime(thread.createdAt),
      thread.legacyId,
      exportBody("post", postById.get(thread.id)!),
      thread.sid,
      thread.reactions,
      "",
      "",
      "",
      "",
      "",
    ]);
    const raw = commentsOf.get(thread.id) ?? [];
    thread.comments.forEach((comment, i) => {
      csvRows.push([
        "",
        "",
        "",
        "",
        "",
        legacyDateTime(comment.createdAt),
        thread.legacyId,
        exportBody("comment", raw[i]),
        comment.sid,
        comment.reactions,
      ]);
    });
  }

  const authors = new Set(threads.map((t) => t.sid)).size;
  const replied = threads.filter((t) => t.comments.length > 0).length;
  const chartData = bucketByWeek(
    [
      ...threads.map((t) => ({ week: weekKey(t.createdAt), series: "posts" as const })),
      ...threads.flatMap((t) => t.comments.map((c) => ({ week: weekKey(c.createdAt), series: "replies" as const }))),
    ],
    ["posts", "replies"],
    { from: filters.from, to: filters.to },
  );

  return {
    view: {
      layout: "thread",
      columns: [],
      rows: [],
      tiles: [
        { label: "Posts", value: formatNumber(threads.length), hint: `by ${formatNumber(authors)} participants` },
        { label: "Replies", value: formatNumber(comments.length) },
        { label: "Posts with a reply", value: percent(replied, threads.length) },
        {
          label: "Reactions",
          value: formatNumber([...posts, ...comments].reduce((s, row) => s + row.reactions, 0)),
          hint: "On these posts and replies",
        },
      ],
      chart:
        chartData.length > 1
          ? {
              title: "Posts and replies per week",
              series: [
                { key: "posts", label: "Posts", color: "chart-1" },
                { key: "replies", label: "Replies", color: "chart-4" },
              ],
              data: chartData,
              labelPrefix: "Week of",
            }
          : undefined,
      notes: [
        "Participants' own wall posts (not the automatic “commented on a Thrive Tip” posts), newest first, each followed by its replies from people with a study ID.",
        "Post content in the export is plain text on one line, followed by a link to the photo and the YouTube link when there is one, as before. IDs are the old Drupal IDs for migrated posts.",
        `The screen shows the newest ${THREAD_SCREEN_LIMIT} threads; the export always has all of them.`,
      ],
      missingSid: population.missingSid,
      extra: { threads: threads.slice(0, THREAD_SCREEN_LIMIT), total: threads.length },
    },
    csv: { filename: meta.filename, rows: csvRows },
  };
}

/** Reaction kinds in legacy column order. */
const REACTION_COLUMNS = [
  { kind: "haha", header: "Smile count", label: "Smile" },
  { kind: "love", header: "Heart count", label: "Heart" },
  { kind: "thumbs_up", header: "Thumbs up count", label: "Thumbs up" },
  { kind: "hundred", header: "100 count", label: "100" },
  { kind: "target", header: "Multi-id pride count", label: "Multi-ID pride" },
] as const;

/**
 * Standard User Reactions Count Report (legacy reactions_count.inc, and the
 * `reaction-count` page): wall-post reactions each person gave, by kind.
 */
export async function reactionsReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  // One row per person who reacted to a wall post, with a count per kind (pivot via count(*) filter).
  const kindCounts = Object.fromEntries(
    REACTION_COLUMNS.map((col) => [col.kind, countWhere(eq(reactions.kind, col.kind))]),
  ) as Record<(typeof REACTION_COLUMNS)[number]["kind"], SQL<number>>;
  const counts = await db
    .select({ userId: reactions.userId, ...kindCounts })
    .from(reactions)
    .where(
      and(
        inIds(reactions.userId, population.ids),
        eq(reactions.targetType, "post"),
        inRange(reactions.createdAt, filters),
      ),
    )
    .groupBy(reactions.userId);
  const byUser = new Map<string, Record<string, number>>(counts.map(({ userId, ...byKind }) => [userId, byKind]));
  const rows = population.people
    .filter((p) => byUser.has(p.id))
    .map((p) => {
      const c = byUser.get(p.id)!;
      const row: Record<string, string | number> & { id: string } = {
        id: p.id,
        userId: p.legacyUid ? String(p.legacyUid) : p.username,
        sid: p.sid,
      };
      let total = 0;
      for (const col of REACTION_COLUMNS) {
        row[col.kind] = c[col.kind] ?? 0;
        total += c[col.kind] ?? 0;
      }
      row.total = total;
      return row;
    });
  const totals = REACTION_COLUMNS.map((col) => ({
    label: col.label,
    count: rows.reduce((s, r) => s + (r[col.kind] as number), 0),
  }));

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        {
          id: "userId",
          label: "User ID",
          kind: "text",
          hint: "Drupal user ID for migrated accounts, otherwise the username",
        },
        ...REACTION_COLUMNS.map((col) => ({ id: col.kind, label: col.label, kind: "heat" as const, hint: col.header })),
        { id: "total", label: "Total", kind: "number" },
      ],
      rows,
      tiles: countTiles(
        rows.map((r) => r.total as number),
        population.people.length,
        "reactions",
      ),
      chart: rows.length
        ? { title: "Reactions by kind", series: [{ key: "count", label: "Reactions", color: "primary" }], data: totals }
        : undefined,
      searchKeys: ["sid", "userId"],
      initialSort: { id: "total", desc: true },
      notes: [
        "Reactions participants gave on wall posts (not on comments), as the old report counted them.",
        "Kinds with no reactions show 0 rather than a blank cell. Only study participants are listed; the old export also listed staff without a study ID.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        ["User Id", "Participant SID", ...REACTION_COLUMNS.map((c) => c.header)],
        ...rows.map((r) => [r.userId, r.sid, ...REACTION_COLUMNS.map((c) => r[c.kind])]),
      ],
    },
  };
}

/**
 * Standard User Content Warning Report (legacy View `cw`): wall posts each
 * participant published behind a content warning (headline).
 */
export async function contentWarningReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const where = and(
    inIds(postsTable.authorId, population.ids),
    eq(postsTable.kind, "post"),
    isNotNull(postsTable.headline),
    ne(postsTable.headline, ""),
    inRange(postsTable.createdAt, filters),
  );
  const week = localWeek(postsTable.createdAt);
  const [perUser, perWeek] = await Promise.all([
    db
      .select({ userId: sql<string>`${postsTable.authorId}`, n: countAll(), last: max(postsTable.createdAt) })
      .from(postsTable)
      .where(where)
      .groupBy(postsTable.authorId),
    db.select({ week, n: countAll() }).from(postsTable).where(where).groupBy(week).orderBy(week),
  ]);
  const counts = new Map(perUser.map((row) => [row.userId, { n: row.n, last: row.last! }]));
  const rows = population.people
    .filter((p) => counts.has(p.id))
    .map((p) => ({ id: p.id, sid: p.sid, count: counts.get(p.id)!.n, last: counts.get(p.id)!.last.toISOString() }));
  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "count", label: "Posts with a warning", kind: "number", hint: "Count" },
        { id: "last", label: "Most recent", kind: "datetime" },
      ],
      rows,
      tiles: countTiles(
        rows.map((r) => r.count),
        population.people.length,
        "posts with a warning",
      ),
      chart: weeklyChart(perWeek, filters, "Content-warning posts per week", "Posts"),
      searchKeys: ["sid"],
      initialSort: { id: "count", desc: true },
      notes: [
        "A content warning is the headline a participant adds above a post (the old site's “!Title!” convention).",
      ],
      missingSid: population.missingSid,
    },
    csv: { filename: meta.filename, rows: [["Participant SID", "Count"], ...rows.map((r) => [r.sid, r.count])] },
  };
}

export async function contentWarningClicksReport(meta: ReportMeta, filters: ReportFilters) {
  const population = await studyPopulation(filters);
  return eventCountReport({
    meta,
    filters,
    population,
    type: "content_warning_open",
    noun: "clicks",
    chartTitle: "Content-warning clicks per week",
    notes: [
      "Counts each time a participant chose to open a post hidden behind a content warning.",
      "The old report was always empty (nothing recorded these clicks) and printed the Drupal user ID instead of the study ID. Both are fixed; numbers start from the new app's launch.",
    ],
  });
}
