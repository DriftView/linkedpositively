import "server-only";
import { and, arrayContains, asc, count, desc, eq, gt, ilike, inArray, isNull, like, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { can, type Viewer } from "@/server/auth/session";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { comments as commentsTable, contentReports, hashtags, posts as postsTable, reactions, users, type Comment, type Post } from "@/server/db/schema";
import { commentMediaUrl, postMediaUrl, tipHref } from "./links";
import { extractMentionIds, renderUserHtml } from "./rich-text";
import {
  FEED_PAGE_SIZE,
  REACTION_KINDS,
  type AuthorDTO,
  type CommentDTO,
  type CommentTarget,
  type PhotoDTO,
  type PostDTO,
  type ReactionCounts,
  type ReactionKind,
  type ReactionSummary,
  type ReactionTarget,
  type Reactor,
} from "./types";

/**
 * Read side of the community area. Everything returns DTOs (plain objects,
 * string ids, ISO dates). Public helpers other areas use:
 *
 *   getReactionSummary(target, viewer)      → ReactionSummary for <ReactionBar>
 *   getReactionSummaries(targets, viewer)   → batch version (Map keyed "type:id")
 *   listComments(target, viewer)            → CommentDTO[] (used by <CommentSection>)
 */

const key = (target: { type: string; id: string }) => `${target.type}:${target.id}`;

/** Escapes `%`, `_` and `\` for a LIKE pattern. */
export function likeEscape(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

type PhotoField = { key: string; type?: string | null; width?: number | null; height?: number | null } | null | undefined;

function photoDto(photo: PhotoField, url: (version: string) => string): PhotoDTO | null {
  if (!photo?.key) return null;
  const version = photo.key.split("/").pop()?.slice(0, 8) ?? "1";
  return {
    url: url(version),
    width: photo.width ?? undefined,
    height: photo.height ?? undefined,
    gif: photo.type === "image/gif",
  };
}

// ---------------------------------------------------------------------------
// People

const FALLBACK_AUTHOR: Omit<AuthorDTO, "id"> = { name: "Former member", username: "" };

/**
 * Looks up display names for many users at once. The returned function maps
 * an id to its author; unknown or null ids (deleted accounts) give "Former member".
 */
export async function getAuthors(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].filter(isUuid);
  const rows = unique.length
    ? await db
        .select({ id: users.id, name: users.name, username: users.username, displayUsername: users.displayUsername })
        .from(users)
        .where(inArray(users.id, unique))
    : [];
  const map = new Map<string, AuthorDTO>();
  for (const user of rows) {
    map.set(user.id, {
      id: user.id,
      name: user.name || user.displayUsername || user.username || "Member",
      username: user.username ?? "",
    });
  }
  return (id: string | null | undefined) => (id && map.get(id)) || { id: id ?? "", ...FALLBACK_AUTHOR };
}

// ---------------------------------------------------------------------------
// Reactions

export type SummaryInput = ReactionTarget & { authorId?: string | null };

function emptyCounts(): ReactionCounts {
  return Object.fromEntries(REACTION_KINDS.map((kind) => [kind, 0])) as ReactionCounts;
}

type ViewerLike = Pick<Viewer, "id" | "roles">;

async function resolveViewer(viewer: ViewerLike | string): Promise<ViewerLike> {
  if (typeof viewer !== "string") return viewer;
  const [user] = isUuid(viewer) ? await db.select({ role: users.role }).from(users).where(eq(users.id, viewer)).limit(1) : [];
  return { id: viewer, roles: parseRoles(user?.role) };
}

/** `(targetType = a and targetId in (…)) or (targetType = b and …)` for a reactions/reports-style table. */
function targetsCondition(
  table: { targetType: typeof reactions.targetType; targetId: typeof reactions.targetId },
  targets: ReactionTarget[],
): SQL {
  const groups = targets.reduce<Record<string, string[]>>((acc, target) => {
    (acc[target.type] ??= []).push(target.id);
    return acc;
  }, {});
  return or(
    ...Object.entries(groups).map(([type, ids]) =>
      and(eq(table.targetType, type as ReactionTarget["type"]), inArray(table.targetId, ids)),
    ),
  )!;
}

/** Reaction counts, the viewer's own reaction and whether they may react, for many items at once. */
export async function getReactionSummaries(targets: SummaryInput[], viewerInput: ViewerLike | string) {
  const viewer = await resolveViewer(viewerInput);
  const valid = targets.filter((target) => isUuid(target.id));
  const result = new Map<string, ReactionSummary>();
  if (!valid.length) return result;

  const where = targetsCondition(reactions, valid);
  const [counts, mine] = await Promise.all([
    db
      .select({ t: reactions.targetType, id: reactions.targetId, k: reactions.kind, n: count() })
      .from(reactions)
      .where(where)
      .groupBy(reactions.targetType, reactions.targetId, reactions.kind),
    isUuid(viewer.id)
      ? db
          .select({ targetType: reactions.targetType, targetId: reactions.targetId, kind: reactions.kind })
          .from(reactions)
          .where(and(where, eq(reactions.userId, viewer.id)))
      : Promise.resolve([]),
  ]);

  const mayReact = hasPermission(viewer.roles, "community.react");
  for (const target of valid) {
    const own = Boolean(target.authorId && target.authorId === viewer.id);
    result.set(key(target), {
      target: { type: target.type, id: target.id },
      counts: emptyCounts(),
      total: 0,
      mine: null,
      canReact: mayReact && !own,
      reason: own ? "own" : mayReact ? undefined : "permission",
    });
  }
  for (const row of counts) {
    const summary = result.get(`${row.t}:${row.id}`);
    if (!summary) continue;
    summary.counts[row.k as ReactionKind] = row.n;
    summary.total += row.n;
  }
  for (const row of mine) {
    const summary = result.get(`${row.targetType}:${row.targetId}`);
    if (summary) summary.mine = row.kind as ReactionKind;
  }
  return result;
}

/**
 * Reaction summary for one item (used by tips and resources pages for
 * <ReactionBar>). Pass `authorId` when the item has a participant author so
 * they can't react to their own content.
 */
export async function getReactionSummary(target: SummaryInput, viewer: ViewerLike | string): Promise<ReactionSummary> {
  const map = await getReactionSummaries([target], viewer);
  return (
    map.get(key(target)) ?? {
      target: { type: target.type, id: target.id },
      counts: emptyCounts(),
      total: 0,
      mine: null,
      canReact: false,
      reason: "permission",
    }
  );
}

export async function listReactors(target: ReactionTarget): Promise<Reactor[]> {
  if (!isUuid(target.id)) return [];
  const rows = await db
    .select({ userId: reactions.userId, kind: reactions.kind })
    .from(reactions)
    .where(and(eq(reactions.targetType, target.type), eq(reactions.targetId, target.id)))
    .orderBy(desc(reactions.createdAt), desc(reactions.id))
    .limit(200);
  const author = await getAuthors(rows.map((row) => row.userId));
  return rows.map((row) => ({ user: author(row.userId), kind: row.kind as ReactionKind }));
}

// ---------------------------------------------------------------------------
// Comments

/** The comment fields `commentDtos` needs (a full `Comment` row works). */
export type CommentRow = Pick<
  Comment,
  "id" | "targetType" | "targetId" | "authorId" | "bodyHtml" | "photo" | "videoId" | "videoStart" | "editedAt" | "createdAt"
>;

async function reportedByViewer(type: "post" | "comment", ids: string[], viewer: Viewer) {
  if (!ids.length || !isUuid(viewer.id)) return new Set<string>();
  const rows = await db
    .select({ targetId: contentReports.targetId })
    .from(contentReports)
    .where(
      and(
        eq(contentReports.targetType, type),
        inArray(contentReports.targetId, ids),
        eq(contentReports.reporterId, viewer.id),
      ),
    );
  return new Set(rows.map((row) => row.targetId));
}

export async function commentDtos(comments: CommentRow[], viewer: Viewer): Promise<CommentDTO[]> {
  if (!comments.length) return [];
  const [author, reactionMap, reported] = await Promise.all([
    getAuthors([
      ...comments.map((comment) => comment.authorId),
      ...comments.flatMap((comment) => extractMentionIds(comment.bodyHtml ?? "")),
    ]),
    getReactionSummaries(
      comments.map((comment) => ({ type: "comment", id: comment.id, authorId: comment.authorId })),
      viewer,
    ),
    reportedByViewer(
      "comment",
      comments.map((comment) => comment.id),
      viewer,
    ),
  ]);
  const moderator = can(viewer, "moderation.review");
  return comments.map((comment) => {
    const id = comment.id;
    const own = Boolean(comment.authorId) && comment.authorId === viewer.id;
    return {
      id,
      target: { type: comment.targetType, id: comment.targetId },
      author: author(comment.authorId),
      html: renderUserHtml(comment.bodyHtml ?? "", (userId) => author(userId).username),
      sourceHtml: comment.bodyHtml ?? "",
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      photo: photoDto(comment.photo, (version) => commentMediaUrl(id, version)),
      video: comment.videoId ? { id: comment.videoId, start: comment.videoStart ?? undefined } : null,
      reactions: reactionMap.get(`comment:${id}`)!,
      canEdit: own && can(viewer, "community.post"),
      canDelete: own || moderator,
      canReport: !own && can(viewer, "community.report"),
      reported: reported.has(id),
    };
  });
}

/** Who may read the comments of a target. */
export function canViewTarget(viewer: Viewer, type: CommentTarget["type"]) {
  if (type === "tip") return can(viewer, "tips.view");
  if (type === "resource") return can(viewer, "resources.view");
  return can(viewer, "community.post");
}

const COMMENT_LIMIT = 200;

/** All comments of a post, tip or resource, oldest first. */
export async function listComments(target: CommentTarget, viewer: Viewer): Promise<CommentDTO[]> {
  if (!isUuid(target.id) || !canViewTarget(viewer, target.type)) return [];
  const rows = await db
    .select()
    .from(commentsTable)
    .where(and(eq(commentsTable.targetType, target.type), eq(commentsTable.targetId, target.id)))
    .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id))
    .limit(COMMENT_LIMIT);
  return commentDtos(rows, viewer);
}

// ---------------------------------------------------------------------------
// Posts

/** The post fields `postDtos` needs (a full `Post` row works). */
export type PostRow = Pick<
  Post,
  | "id"
  | "kind"
  | "authorId"
  | "bodyHtml"
  | "headline"
  | "photo"
  | "videoId"
  | "videoStart"
  | "tags"
  | "tipId"
  | "tipCommentId"
  | "tipTitle"
  | "commentCount"
  | "editedAt"
  | "createdAt"
>;

export type PostDtoOptions = { lastVisit?: Date | null; withComments?: boolean };

export async function postDtos(posts: PostRow[], viewer: Viewer, options: PostDtoOptions = {}): Promise<PostDTO[]> {
  if (!posts.length) return [];
  const withComments = options.withComments ?? true;
  const mirrorOf = (post: PostRow) =>
    post.kind === "tip_comment" && post.tipId && post.tipCommentId
      ? { tipId: post.tipId, commentId: post.tipCommentId, tipTitle: post.tipTitle }
      : null;
  const reactionTargets = posts.map((post) => {
    const tip = mirrorOf(post);
    return tip
      ? { type: "comment" as const, id: tip.commentId, authorId: post.authorId }
      : { type: "post" as const, id: post.id, authorId: post.authorId };
  });
  const commentable = posts.filter((post) => post.kind !== "tip_comment");
  const [author, reactionMap, reported, comments] = await Promise.all([
    getAuthors([...posts.map((post) => post.authorId), ...posts.flatMap((post) => extractMentionIds(post.bodyHtml ?? ""))]),
    getReactionSummaries(reactionTargets, viewer),
    reportedByViewer(
      "post",
      posts.map((post) => post.id),
      viewer,
    ),
    withComments && commentable.length
      ? db
          .select()
          .from(commentsTable)
          .where(
            and(
              eq(commentsTable.targetType, "post"),
              inArray(
                commentsTable.targetId,
                commentable.map((post) => post.id),
              ),
            ),
          )
          .orderBy(asc(commentsTable.createdAt), asc(commentsTable.id))
          .limit(COMMENT_LIMIT * 4)
          .then((rows) => commentDtos(rows, viewer))
      : Promise.resolve([] as CommentDTO[]),
  ]);

  const commentsByPost = new Map<string, CommentDTO[]>();
  for (const comment of comments) {
    const list = commentsByPost.get(comment.target.id) ?? [];
    list.push(comment);
    commentsByPost.set(comment.target.id, list);
  }

  const moderator = can(viewer, "moderation.review");
  const mayPost = can(viewer, "community.post");
  return posts.map((post, index) => {
    const id = post.id;
    const own = Boolean(post.authorId) && post.authorId === viewer.id;
    const tip = mirrorOf(post);
    return {
      id,
      kind: tip ? "tip_comment" : "post",
      author: author(post.authorId),
      html: renderUserHtml(post.bodyHtml ?? "", (userId) => author(userId).username),
      sourceHtml: post.bodyHtml ?? "",
      headline: post.headline ?? null,
      createdAt: post.createdAt.toISOString(),
      editedAt: post.editedAt?.toISOString() ?? null,
      isNew: Boolean(options.lastVisit && !own && post.createdAt > options.lastVisit),
      photo: photoDto(post.photo, (version) => postMediaUrl(id, version)),
      video: post.videoId ? { id: post.videoId, start: post.videoStart ?? undefined } : null,
      tags: post.tags ?? [],
      reactions: reactionMap.get(key(reactionTargets[index]))!,
      commentCount: post.commentCount ?? 0,
      comments: commentsByPost.get(id) ?? [],
      canComment: !tip && mayPost,
      canEdit: !tip && own && mayPost,
      canDelete: own || moderator,
      canReport: !own && can(viewer, "community.report"),
      reported: reported.has(id),
      tipComment: tip
        ? {
            tipId: tip.tipId,
            commentId: tip.commentId,
            tipTitle: tip.tipTitle ?? null,
            href: `${tipHref(tip.tipId)}#comment-${tip.commentId}`,
          }
        : null,
    } satisfies PostDTO;
  });
}

/** Cursor = "<createdAt ms>_<id>" of the last item of the previous page. */
export function encodeCursor(item: { createdAt: Date; id: string }) {
  return `${item.createdAt.getTime()}_${item.id}`;
}

export function decodeCursor(cursor?: string | null) {
  if (!cursor) return null;
  const [ms, id] = cursor.split("_");
  if (!ms || !id || !isUuid(id) || !/^\d+$/.test(ms)) return null;
  return { createdAt: new Date(Number(ms)), id };
}

export type FeedQuery = {
  cursor?: string | null;
  authorId?: string;
  tag?: string;
  ids?: string[];
  limit?: number;
  lastVisit?: Date | null;
};

export type FeedPage = { posts: PostDTO[]; nextCursor: string | null; raw: { createdAt: Date }[] };

/** One page of the wall (newest first), optionally one person's posts or one hashtag. */
export async function getFeedPage(viewer: Viewer, query: FeedQuery = {}): Promise<FeedPage> {
  const limit = Math.min(query.limit ?? FEED_PAGE_SIZE, 30);
  const conditions: (SQL | undefined)[] = [];
  if (query.authorId) {
    if (!isUuid(query.authorId)) return { posts: [], nextCursor: null, raw: [] };
    conditions.push(eq(postsTable.authorId, query.authorId));
  }
  if (query.tag) conditions.push(arrayContains(postsTable.tags, [query.tag.toLowerCase()]));
  if (query.ids) {
    const ids = query.ids.filter(isUuid);
    if (!ids.length) return { posts: [], nextCursor: null, raw: [] };
    conditions.push(inArray(postsTable.id, ids));
  }
  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    conditions.push(
      or(
        lt(postsTable.createdAt, cursor.createdAt),
        and(eq(postsTable.createdAt, cursor.createdAt), lt(postsTable.id, cursor.id)),
      ),
    );
  }
  const rows = await db
    .select()
    .from(postsTable)
    .where(and(...conditions))
    .orderBy(desc(postsTable.createdAt), desc(postsTable.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const posts = await postDtos(page, viewer, { lastVisit: query.lastVisit });
  const last = page.at(-1);
  return { posts, nextCursor: rows.length > limit && last ? encodeCursor(last) : null, raw: page };
}

export async function getPost(id: string, viewer: Viewer): Promise<PostDTO | null> {
  if (!isUuid(id)) return null;
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
  if (!post) return null;
  const [dto] = await postDtos([post], viewer);
  return dto ?? null;
}

/** New-id lookup for legacy /wall-post/{nid} links. */
export async function findPostIdByLegacyNid(nid: number) {
  const [post] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(eq(postsTable.legacySite, "lp"), eq(postsTable.legacyId, nid)))
    .limit(1);
  return post?.id ?? null;
}

export async function countTagPosts(tag: string) {
  const [row] = await db
    .select({ n: count() })
    .from(postsTable)
    .where(arrayContains(postsTable.tags, [tag.toLowerCase()]));
  return row?.n ?? 0;
}

/** Popular hashtags, for search suggestions. */
export async function popularTags(limit = 12) {
  const rows = await db
    .select({ name: hashtags.name, useCount: hashtags.useCount })
    .from(hashtags)
    .where(gt(hashtags.useCount, 0))
    .orderBy(desc(hashtags.useCount), sql`${hashtags.lastUsedAt} desc nulls last`, asc(hashtags.name))
    .limit(limit);
  return rows.map((row) => ({ name: row.name, count: row.useCount ?? 0 }));
}

export async function suggestTags(prefix: string, limit = 6) {
  const clean = prefix.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40);
  const rows = await db
    .select({ name: hashtags.name, useCount: hashtags.useCount })
    .from(hashtags)
    .where(and(gt(hashtags.useCount, 0), clean ? like(hashtags.name, `${likeEscape(clean)}%`) : undefined))
    .orderBy(desc(hashtags.useCount), asc(hashtags.name))
    .limit(limit);
  return rows.map((row) => ({ name: row.name, count: row.useCount ?? 0 }));
}

/** People who can be @mentioned: anyone with access to the community. */
export async function suggestPeople(viewer: Viewer, query: string, limit = 6): Promise<AuthorDTO[]> {
  const clean = query.trim().replace(/^@/, "").slice(0, 40);
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(users)
    .where(
      and(
        isUuid(viewer.id) ? ne(users.id, viewer.id) : undefined,
        or(isNull(users.banned), ne(users.banned, true)),
        sql`${users.role} ~ '(participant|admin|research_admin|coordinator)'`,
        clean
          ? or(
              ilike(users.username, `${likeEscape(clean)}%`),
              sql`${users.name} ~* ${`(^|\\s)${escapeRegex(clean)}`}`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(users.name), asc(users.id))
    .limit(limit * 2);
  return rows
    .filter((user) => hasPermission(parseRoles(user.role), "community.post"))
    .slice(0, limit)
    .map((user) => ({ id: user.id, name: user.name || user.username || "Member", username: user.username ?? "" }));
}

/** Escapes a string for a Postgres (or JS) regular expression. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
