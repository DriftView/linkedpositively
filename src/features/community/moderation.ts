import "server-only";
import { and, count, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { comments, contentReports, posts } from "@/server/db/schema";
import { commentHref, commentMediaUrl, postHref, postMediaUrl } from "./links";
import { getAuthors } from "./queries";
import type { AuthorDTO, CommentTarget } from "./types";

/** One reported (or whitelisted) item in the moderation queue. */
export type ModerationItem = {
  type: "post" | "comment";
  id: string;
  author: AuthorDTO;
  createdAt: string;
  text: string;
  headline: string | null;
  photoUrl: string | null;
  hasVideo: boolean;
  href: string;
  /** For comments: what they're on. */
  context: string | null;
  reports: { reporter: AuthorDTO; at: string }[];
  lastReportedAt: string | null;
  whitelistedAt: string | null;
  whitelistedBy: AuthorDTO | null;
};

type Row = {
  id: string;
  authorId: string | null;
  bodyText: string | null;
  headline: string | null;
  photo: { key?: string | null } | null;
  videoId: string | null;
  createdAt: Date;
  lastReportedAt: Date | null;
  whitelistedAt: Date | null;
  whitelistedBy: string | null;
  targetType: CommentTarget["type"] | null;
  targetId: string | null;
};

const TARGET_LABEL: Record<CommentTarget["type"], string> = { post: "a wall post", tip: "a thrive tip", resource: "a resource" };

/**
 * The queue (legacy /admin/abuse-node "Wall Post Abuse" and
 * /admin/abuse-comment "Comment Abuse"): items with open reports, most
 * recently reported first, or the whitelist.
 */
export async function moderationQueue(type: "post" | "comment", view: "open" | "whitelisted" = "open") {
  const open = view === "open";
  const rows: Row[] =
    type === "post"
      ? await db
          .select({
            id: posts.id,
            authorId: posts.authorId,
            bodyText: posts.bodyText,
            headline: posts.headline,
            photo: posts.photo,
            videoId: posts.videoId,
            createdAt: posts.createdAt,
            lastReportedAt: posts.lastReportedAt,
            whitelistedAt: posts.whitelistedAt,
            whitelistedBy: posts.whitelistedBy,
            targetType: sql<null>`null`,
            targetId: sql<null>`null`,
          })
          .from(posts)
          .where(open ? gt(posts.reportCount, 0) : isNotNull(posts.whitelistedAt))
          .orderBy(
            open ? sql`${posts.lastReportedAt} desc nulls last` : desc(posts.whitelistedAt),
            desc(posts.id),
          )
          .limit(100)
      : await db
          .select({
            id: comments.id,
            authorId: comments.authorId,
            bodyText: comments.bodyText,
            headline: sql<null>`null`,
            photo: comments.photo,
            videoId: comments.videoId,
            createdAt: comments.createdAt,
            lastReportedAt: comments.lastReportedAt,
            whitelistedAt: comments.whitelistedAt,
            whitelistedBy: comments.whitelistedBy,
            targetType: comments.targetType,
            targetId: comments.targetId,
          })
          .from(comments)
          .where(open ? gt(comments.reportCount, 0) : isNotNull(comments.whitelistedAt))
          .orderBy(
            open ? sql`${comments.lastReportedAt} desc nulls last` : desc(comments.whitelistedAt),
            desc(comments.id),
          )
          .limit(100);

  const reports =
    open && rows.length
      ? await db
          .select({ targetId: contentReports.targetId, reporterId: contentReports.reporterId, createdAt: contentReports.createdAt })
          .from(contentReports)
          .where(
            and(
              eq(contentReports.targetType, type),
              inArray(
                contentReports.targetId,
                rows.map((row) => row.id),
              ),
              eq(contentReports.status, "open"),
            ),
          )
          .orderBy(desc(contentReports.createdAt), desc(contentReports.id))
      : [];
  const author = await getAuthors([
    ...rows.map((row) => row.authorId),
    ...rows.flatMap((row) => (row.whitelistedBy ? [row.whitelistedBy] : [])),
    ...reports.map((report) => report.reporterId),
  ]);

  return rows.map((row): ModerationItem => {
    const id = row.id;
    const target: CommentTarget | null = row.targetType && row.targetId ? { type: row.targetType, id: row.targetId } : null;
    const version = row.photo?.key?.split("/").pop()?.slice(0, 8) ?? "1";
    return {
      type,
      id,
      author: author(row.authorId),
      createdAt: row.createdAt.toISOString(),
      text: row.bodyText ?? "",
      headline: row.headline ?? null,
      photoUrl: row.photo?.key ? (type === "post" ? postMediaUrl(id, version) : commentMediaUrl(id, version)) : null,
      hasVideo: Boolean(row.videoId),
      href: type === "post" ? postHref(id) : target ? commentHref(target, id) : "/",
      context: target ? `Comment on ${TARGET_LABEL[target.type]}` : null,
      reports: reports
        .filter((report) => report.targetId === id)
        .map((report) => ({ reporter: author(report.reporterId), at: report.createdAt.toISOString() })),
      lastReportedAt: row.lastReportedAt?.toISOString() ?? null,
      whitelistedAt: row.whitelistedAt?.toISOString() ?? null,
      whitelistedBy: row.whitelistedBy ? author(row.whitelistedBy) : null,
    };
  });
}

export async function moderationCounts() {
  const [[postCount], [commentCount]] = await Promise.all([
    db.select({ n: count() }).from(posts).where(gt(posts.reportCount, 0)),
    db.select({ n: count() }).from(comments).where(gt(comments.reportCount, 0)),
  ]);
  return { posts: postCount?.n ?? 0, comments: commentCount?.n ?? 0 };
}
