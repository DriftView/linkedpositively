import "server-only";
import { and, count, eq, gt, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { award, type PointReason } from "@/features/gamification/points";
import { excerpt as notifyExcerpt, notify, retractNotifications } from "@/features/notifications/notify";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { db, withTransaction, type Executor } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import {
  comments,
  communityUploads,
  contentReports,
  hashtags,
  mentions,
  pointEntries,
  posts,
  reactions,
  resources,
  tips,
  users,
  type Comment,
  type Post,
} from "@/server/db/schema";
import { logger } from "@/server/logger";
import { deleteFile } from "@/server/services/storage";
import { commentHref, postHref } from "./links";
import type { CommentTarget, ReactionTarget } from "./types";

/**
 * Write-side helpers shared by the community Server Actions and the
 * moderation screen. Not actions themselves: callers check permissions.
 * Helpers that write take an optional `Executor` (`db` or a transaction).
 */

// ---------------------------------------------------------------------------
// Targets

export type ResolvedTarget = {
  /** Participant author (posts/comments); null for staff-authored tips/resources or deleted accounts. */
  authorId: string | null;
  title?: string;
  /** For comments: what the comment is on. */
  parent?: CommentTarget;
  commentable: boolean;
};

/** Looks up a comment/reaction target; null when it doesn't exist (or isn't visible). */
export async function resolveTarget(target: CommentTarget | ReactionTarget): Promise<ResolvedTarget | null> {
  if (!isUuid(target.id)) return null;
  const id = target.id;
  switch (target.type) {
    case "post": {
      const [post] = await db.select({ authorId: posts.authorId, kind: posts.kind }).from(posts).where(eq(posts.id, id)).limit(1);
      return post ? { authorId: post.authorId, commentable: post.kind !== "tip_comment" } : null;
    }
    case "comment": {
      const [comment] = await db
        .select({ authorId: comments.authorId, targetType: comments.targetType, targetId: comments.targetId })
        .from(comments)
        .where(eq(comments.id, id))
        .limit(1);
      return comment
        ? {
            authorId: comment.authorId,
            commentable: false,
            parent: { type: comment.targetType, id: comment.targetId },
          }
        : null;
    }
    case "tip": {
      const [tip] = await db
        .select({ title: tips.title })
        .from(tips)
        .where(and(eq(tips.id, id), eq(tips.published, true)))
        .limit(1);
      return tip ? { authorId: null, title: tip.title, commentable: true } : null;
    }
    case "resource": {
      const [resource] = await db
        .select({ title: resources.title })
        .from(resources)
        .where(and(eq(resources.id, id), eq(resources.status, "published")))
        .limit(1);
      return resource ? { authorId: null, title: resource.title, commentable: true } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Uploads

export async function removeStoredFile(key?: string | null) {
  if (!key) return;
  try {
    await deleteFile(key);
    await db.delete(communityUploads).where(eq(communityUploads.key, key));
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "community file delete failed");
  }
}

// ---------------------------------------------------------------------------
// Hashtags and mentions

/**
 * Adjusts hashtag use counts (+1 for `added`, creating the tag, −1 for
 * `removed`). Outside a transaction, failures are logged and ignored.
 */
export async function bumpHashtags(added: string[], removed: string[], executor: Executor = db) {
  const plus = [...new Set(added)];
  const minus = [...new Set(removed)];
  const now = new Date();
  const run = async () => {
    if (plus.length) {
      await executor
        .insert(hashtags)
        .values(plus.map((name) => ({ name, useCount: 1, lastUsedAt: now })))
        .onConflictDoUpdate({
          target: hashtags.name,
          set: { useCount: sql`${hashtags.useCount} + 1`, lastUsedAt: now },
        });
    }
    if (minus.length) {
      await executor
        .update(hashtags)
        .set({ useCount: sql`${hashtags.useCount} - 1` })
        .where(inArray(hashtags.name, minus));
    }
  };
  if (executor !== db) return run();
  await run().catch((error: Error) => logger.warn({ err: error.message }, "hashtag count update failed"));
}

/** Recomputes a post's tags from its body and its comments (legacy behaviour). */
export async function refreshPostTags(postId: string, executor: Executor = db) {
  const [[post], commentTags] = await Promise.all([
    executor.select({ tags: posts.tags, bodyTags: posts.bodyTags }).from(posts).where(eq(posts.id, postId)).limit(1),
    executor
      .selectDistinct({ tag: sql<string>`unnest(${comments.tags})` })
      .from(comments)
      .where(and(eq(comments.targetType, "post"), eq(comments.targetId, postId))),
  ]);
  if (!post) return;
  const next: string[] = [...new Set<string>([...(post.bodyTags ?? []), ...commentTags.map((row) => row.tag)])];
  const before: string[] = post.tags ?? [];
  await executor.update(posts).set({ tags: next }).where(eq(posts.id, postId));
  await bumpHashtags(
    next.filter((tag) => !before.includes(tag)),
    before.filter((tag) => !next.includes(tag)),
    executor,
  );
}

/** Keeps only ids of people who can take part in the community. */
export async function validMentionIds(ids: string[], authorId: string) {
  const candidates = ids.filter((id) => isUuid(id) && id !== authorId).slice(0, 20);
  if (!candidates.length) return [];
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(inArray(users.id, candidates), or(isNull(users.banned), ne(users.banned, true))));
  return rows.filter((user) => hasPermission(parseRoles(user.role), "community.post")).map((user) => user.id);
}

/** Stores mentions for an entity and returns the newly mentioned user ids. */
export async function syncMentions(
  entityType: "post" | "comment",
  entityId: string,
  authorId: string,
  ids: string[],
  executor: Executor = db,
) {
  const existing = await executor
    .select({ userId: mentions.userId })
    .from(mentions)
    .where(and(eq(mentions.entityType, entityType), eq(mentions.entityId, entityId)));
  const before = new Set(existing.map((row) => row.userId));
  const next = new Set(ids);
  const added = [...next].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !next.has(id));
  if (removed.length) {
    await executor
      .delete(mentions)
      .where(and(eq(mentions.entityType, entityType), eq(mentions.entityId, entityId), inArray(mentions.userId, removed)));
  }
  if (added.length) {
    await executor
      .insert(mentions)
      .values(added.map((userId) => ({ entityType, entityId, userId, authorId })))
      .onConflictDoNothing();
  }
  return added;
}

// ---------------------------------------------------------------------------
// Points (docs/legacy/04 §2.2, P1–P5) with daily caps so they can't be farmed.

export const DAILY_CAPS: Partial<Record<PointReason, number>> = {
  post: 5,
  comment_on_post: 10,
  comment_on_tip: 10,
  comment_on_resource: 10,
  comment_received: 20,
  reaction_given: 30,
  reaction_earned: 30,
};

export async function awardCapped(userId: string, reason: PointReason, key: string) {
  const cap = DAILY_CAPS[reason];
  if (cap) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const total = await db
      .select({ n: count() })
      .from(pointEntries)
      .where(and(eq(pointEntries.userId, userId), eq(pointEntries.reason, reason), gte(pointEntries.at, since)))
      .then(([row]) => row?.n ?? 0)
      .catch(() => 0);
    if (total >= cap) return;
  }
  await award({ userId, reason, key });
}

// ---------------------------------------------------------------------------
// Notifications (docs/legacy/03 §6.2). Dedupe keys start with the entity so
// deleting it can retract everything it caused.

export const notifyKeys = {
  post: (postId: string) => `post:${postId}:`,
  comment: (commentId: string) => `comment:${commentId}:`,
  reaction: (target: ReactionTarget, userId: string) => `${target.type}:${target.id}:reaction:${userId}`,
};

export async function notifyMentions(input: {
  userIds: string[];
  actor: { id: string; name: string };
  entity: "post" | "comment";
  entityId: string;
  text: string;
  href: string;
}) {
  await Promise.all(
    input.userIds.map((userId) =>
      notify({
        userId,
        actorId: input.actor.id,
        kind: input.entity === "post" ? "post_mention" : "comment_mention",
        text: `${input.actor.name} tagged you in a ${input.entity}.`,
        excerpt: notifyExcerpt(input.text),
        href: input.href,
        dedupeKey: `${input.entity}:${input.entityId}:mention:${userId}`,
      }),
    ),
  );
}

const TARGET_NOUN: Record<CommentTarget["type"], string> = { post: "post", tip: "tip", resource: "resource" };

/** Comment notifications: the post's author, and everyone else who commented on the same item. */
export async function notifyComment(input: {
  comment: { id: string; text: string };
  target: CommentTarget;
  targetAuthorId: string | null;
  actor: { id: string; name: string };
}) {
  const { comment, target, actor } = input;
  const href = commentHref(target, comment.id);
  const excerpt = notifyExcerpt(comment.text);
  const tasks: Promise<unknown>[] = [];
  let authorName = "someone";
  if (input.targetAuthorId) {
    const [author] = await db
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, input.targetAuthorId))
      .limit(1);
    authorName = author?.name || author?.username || authorName;
    tasks.push(
      notify({
        userId: input.targetAuthorId,
        actorId: actor.id,
        kind: "post_comment",
        text: `${actor.name} made a comment on your ${TARGET_NOUN[target.type]}.`,
        excerpt,
        href,
        dedupeKey: `comment:${comment.id}:author`,
      }),
    );
  }
  const commenters = await db
    .selectDistinct({ authorId: comments.authorId })
    .from(comments)
    .where(and(eq(comments.targetType, target.type), eq(comments.targetId, target.id), isNotNull(comments.authorId)));
  const others = commenters
    .flatMap((row) => (row.authorId ? [row.authorId] : []))
    .filter((id) => id !== actor.id && id !== input.targetAuthorId)
    .slice(0, 50);
  const also =
    target.type === "post"
      ? `${actor.name} also made a comment on ${authorName}'s post.`
      : `${actor.name} also commented on a ${TARGET_NOUN[target.type]} you commented on.`;
  for (const userId of others) {
    tasks.push(
      notify({
        userId,
        actorId: actor.id,
        kind: "also_commented",
        text: also,
        excerpt,
        href,
        dedupeKey: `comment:${comment.id}:also:${userId}`,
      }),
    );
  }
  await Promise.all(tasks);
}

export async function notifyReaction(input: {
  target: ReactionTarget;
  authorId: string;
  actor: { id: string; name: string };
  kind: string;
  parent?: CommentTarget;
}) {
  const { target } = input;
  if (target.type !== "post" && target.type !== "comment") return;
  let text = "";
  let href = postHref(target.id);
  if (target.type === "post") {
    const [post] = await db
      .select({ bodyText: posts.bodyText, headline: posts.headline })
      .from(posts)
      .where(eq(posts.id, target.id))
      .limit(1);
    text = post?.headline ? `Content warning: ${post.headline}` : (post?.bodyText ?? "");
  } else {
    const [comment] = await db.select({ bodyText: comments.bodyText }).from(comments).where(eq(comments.id, target.id)).limit(1);
    text = comment?.bodyText ?? "";
    if (input.parent) href = commentHref(input.parent, target.id);
  }
  await notify({
    userId: input.authorId,
    actorId: input.actor.id,
    kind: target.type === "post" ? "post_reaction" : "comment_reaction",
    text: `${input.actor.name} reacted to your ${target.type}.`,
    reaction: input.kind,
    excerpt: notifyExcerpt(text),
    href,
    dedupeKey: notifyKeys.reaction(target, input.actor.id),
  });
}

// ---------------------------------------------------------------------------
// Deleting (hard delete, with everything hanging off the item). The database
// work runs in one transaction; stored photos are removed afterwards.

async function cascadeComment(tx: Executor, commentId: string, files: Set<string>): Promise<Comment | null> {
  const [comment] = await tx.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) return null;
  const id = comment.id;
  // Wall mirrors of a tip comment first: their foreign key would drop them silently.
  if (comment.targetType === "tip") {
    const mirrors = await tx.select({ id: posts.id }).from(posts).where(eq(posts.tipCommentId, id));
    for (const mirror of mirrors) await cascadePost(tx, mirror.id, files);
  }
  await tx.delete(comments).where(eq(comments.id, id));
  await tx.delete(reactions).where(and(eq(reactions.targetType, "comment"), eq(reactions.targetId, id)));
  await tx.delete(mentions).where(and(eq(mentions.entityType, "comment"), eq(mentions.entityId, id)));
  await tx
    .update(contentReports)
    .set({ status: "removed", resolvedAt: new Date() })
    .where(and(eq(contentReports.targetType, "comment"), eq(contentReports.targetId, id), eq(contentReports.status, "open")));
  await retractNotifications(notifyKeys.comment(id), tx);
  if (comment.photo?.key) files.add(comment.photo.key);
  if (comment.targetType === "post") {
    await tx
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} - 1` })
      .where(and(eq(posts.id, comment.targetId), gt(posts.commentCount, 0)));
    await refreshPostTags(comment.targetId, tx);
  }
  return comment;
}

async function cascadePost(tx: Executor, postId: string, files: Set<string>): Promise<Post | null> {
  const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return null;
  const postComments = await tx
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.targetType, "post"), eq(comments.targetId, post.id)));
  for (const comment of postComments) await cascadeComment(tx, comment.id, files);
  // Tags as they are now: deleting the comments already uncounted theirs.
  const [current] = await tx.select({ tags: posts.tags }).from(posts).where(eq(posts.id, post.id));
  await tx.delete(posts).where(eq(posts.id, post.id));
  await tx.delete(reactions).where(and(eq(reactions.targetType, "post"), eq(reactions.targetId, post.id)));
  await tx.delete(mentions).where(and(eq(mentions.entityType, "post"), eq(mentions.entityId, post.id)));
  await tx
    .update(contentReports)
    .set({ status: "removed", resolvedAt: new Date() })
    .where(and(eq(contentReports.targetType, "post"), eq(contentReports.targetId, post.id), eq(contentReports.status, "open")));
  await retractNotifications(notifyKeys.post(post.id), tx);
  if (post.photo?.key) files.add(post.photo.key);
  await bumpHashtags([], current?.tags ?? [], tx);
  return post;
}

async function removeFiles(files: Set<string>) {
  for (const key of files) await removeStoredFile(key);
}

/**
 * Runs a cascade in `executor` when given (files are removed right away, as
 * the caller owns the transaction), or in its own transaction (files are
 * removed after it commits).
 */
async function runCascade<T>(executor: Executor | undefined, fn: (tx: Executor, files: Set<string>) => Promise<T>) {
  const files = new Set<string>();
  const result = executor ? await fn(executor, files) : await withTransaction((tx) => fn(tx, files));
  await removeFiles(files);
  return result;
}

export async function deleteCommentCascade(commentId: string, executor?: Executor) {
  if (!isUuid(commentId)) return null;
  return runCascade(executor, (tx, files) => cascadeComment(tx, commentId, files));
}

export async function deletePostCascade(postId: string, executor?: Executor) {
  if (!isUuid(postId)) return null;
  return runCascade(executor, (tx, files) => cascadePost(tx, postId, files));
}

/** Recounts open reports on an item (and keeps the last report time when none are left). */
export async function refreshReportCount(type: "post" | "comment", id: string, executor: Executor = db) {
  const open = and(eq(contentReports.targetType, type), eq(contentReports.targetId, id), eq(contentReports.status, "open"));
  const countSql = sql<number>`(select count(*)::int from ${contentReports} where ${open})`;
  const latestSql = (column: typeof posts.lastReportedAt | typeof comments.lastReportedAt) =>
    sql<Date>`coalesce((select max(${contentReports.createdAt}) from ${contentReports} where ${open}), ${column})`;
  if (type === "post") {
    await executor
      .update(posts)
      .set({ reportCount: countSql, lastReportedAt: latestSql(posts.lastReportedAt) })
      .where(eq(posts.id, id));
  } else {
    await executor
      .update(comments)
      .set({ reportCount: countSql, lastReportedAt: latestSql(comments.lastReportedAt) })
      .where(eq(comments.id, id));
  }
}

/**
 * Removes the discussion attached to a tip or resource that is being deleted:
 * its comments (with their reactions, mentions and wall mirrors) and the
 * reactions on the item itself. Pass the caller's transaction as `executor`
 * to make it part of the same delete.
 */
export async function deleteTargetDiscussion(type: "tip" | "resource", ids: readonly string[], executor?: Executor) {
  const valid = ids.filter(isUuid);
  if (!valid.length) return;
  await runCascade(executor, async (tx, files) => {
    const rows = await tx
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.targetType, type), inArray(comments.targetId, valid)));
    for (const row of rows) await cascadeComment(tx, row.id, files);
    await tx.delete(reactions).where(and(eq(reactions.targetType, type), inArray(reactions.targetId, valid)));
  });
}
