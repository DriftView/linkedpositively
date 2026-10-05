"use server";

import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { AuthError, can } from "@/server/auth/session";
import { db, withTransaction, type Executor } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { comments, communityUploads, contentReports, posts, reactions, type Photo } from "@/server/db/schema";
import { retractNotifications } from "@/features/notifications/notify";
import { trackUsage } from "@/server/services/usage";
import { buildFeed } from "./feed";
import { commentHref, postHref } from "./links";
import { canViewTarget, commentDtos, getReactionSummary, listReactors, postDtos } from "./queries";
import { parseYouTube, prepareUserHtml } from "./rich-text";
import {
  createCommentSchema,
  createPostSchema,
  feedSchema,
  idSchema,
  moderateSchema,
  reactSchema,
  reactionTargetSchema,
  reportSchema,
  updateCommentSchema,
  updatePostSchema,
} from "./schemas";
import {
  awardCapped,
  bumpHashtags,
  deleteCommentCascade,
  deletePostCascade,
  notifyComment,
  notifyKeys,
  notifyMentions,
  notifyReaction,
  refreshPostTags,
  refreshReportCount,
  removeStoredFile,
  resolveTarget,
  syncMentions,
  validMentionIds,
} from "./service";
import { COMMENT_MAX_TEXT, POST_MAX_TEXT, type CommentTarget } from "./types";

const PHOTO_MISSING = "That photo couldn't be found. Please add it again.";

/** Claims an upload for a post/comment. Only the uploader may use it. */
async function claimUpload(tx: Executor, uploadId: string, ownerId: string): Promise<Photo> {
  if (!isUuid(uploadId)) throw new UserFacingError(PHOTO_MISSING);
  const [upload] = await tx
    .update(communityUploads)
    .set({ attachedAt: new Date() })
    .where(and(eq(communityUploads.id, uploadId), eq(communityUploads.ownerId, ownerId), isNull(communityUploads.attachedAt)))
    .returning();
  if (!upload) throw new UserFacingError(PHOTO_MISSING);
  return { key: upload.key, type: upload.type, width: upload.width ?? undefined, height: upload.height ?? undefined };
}

const EMPTY_POST = "You must not have much on your mind… Add a few words, a photo or a video.";
const BAD_VIDEO = "Only YouTube videos can be shared. Please check the link.";

function parseVideo(url?: string) {
  if (!url) return null;
  const video = parseYouTube(url);
  if (!video) throw new UserFacingError(BAD_VIDEO);
  return video;
}

async function assertNotFlooding(authorId: string, kind: "post" | "comment") {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const table = kind === "post" ? posts : comments;
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(and(eq(table.authorId, authorId), gte(table.createdAt, since)));
  if ((row?.n ?? 0) >= (kind === "post" ? 10 : 30)) {
    throw new UserFacingError("You're posting a lot right now. Take a breather and try again in a few minutes.");
  }
}

// ---------------------------------------------------------------------------
// Feed (infinite scroll)

export const loadFeed = authedAction.inputSchema(feedSchema).action(async ({ parsedInput, ctx: { viewer } }) => {
  if (!can(viewer, "community.post")) throw new AuthError();
  const since = parsedInput.since ? new Date(parsedInput.since) : null;
  return buildFeed(viewer, {
    cursor: parsedInput.cursor,
    authorId: parsedInput.authorId,
    tag: parsedInput.tag,
    lastVisit: since && !Number.isNaN(since.getTime()) ? since : null,
    withTips: !parsedInput.authorId && !parsedInput.tag,
  });
});

// ---------------------------------------------------------------------------
// Posts

export const createPost = permissionAction("community.post")
  .inputSchema(createPostSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const body = prepareUserHtml(parsedInput.html, { allowHeadline: true });
    if (body.text.length > POST_MAX_TEXT) throw new UserFacingError(`Posts can be up to ${POST_MAX_TEXT} characters.`);
    const video = parseVideo(parsedInput.videoUrl);
    const headline = parsedInput.headline?.trim() || body.headline;
    if (!body.html && !parsedInput.uploadId && !video) throw new UserFacingError(EMPTY_POST);
    await assertNotFlooding(viewer.id, "post");

    const mentionIds = await validMentionIds(body.mentionIds, viewer.id);
    const { post, added } = await withTransaction(async (tx) => {
      const photo = parsedInput.uploadId ? await claimUpload(tx, parsedInput.uploadId, viewer.id) : null;
      const [post] = await tx
        .insert(posts)
        .values({
          authorId: viewer.id,
          bodyHtml: body.html,
          bodyText: body.text,
          headline: headline || null,
          photo,
          videoId: video?.id ?? null,
          videoStart: video?.start ?? null,
          tags: body.tags,
          bodyTags: body.tags,
          mentionIds,
        })
        .returning();
      await bumpHashtags(body.tags, [], tx);
      const added = await syncMentions("post", post.id, viewer.id, mentionIds, tx);
      return { post, added };
    });
    const id = post.id;

    await Promise.all([
      notifyMentions({ userIds: added, actor: viewer, entity: "post", entityId: id, text: body.text, href: postHref(id) }),
      awardCapped(viewer.id, "post", `post:${id}`),
    ]);

    const [dto] = await postDtos([post], viewer);
    return { post: dto };
  });

export const updatePost = permissionAction("community.post")
  .inputSchema(updatePostSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, parsedInput.id)).limit(1);
    if (!post || post.kind === "tip_comment") throw new UserFacingError("That post no longer exists.");
    if (post.authorId !== viewer.id) throw new AuthError("You can only edit your own posts.");

    const body = prepareUserHtml(parsedInput.html, { allowHeadline: true });
    if (body.text.length > POST_MAX_TEXT) throw new UserFacingError(`Posts can be up to ${POST_MAX_TEXT} characters.`);
    const video = parseVideo(parsedInput.videoUrl);
    const headline = parsedInput.headline?.trim() || body.headline;
    if (!body.html && !(parsedInput.uploadId || (post.photo?.key && !parsedInput.removePhoto)) && !video) {
      throw new UserFacingError(EMPTY_POST);
    }

    const oldPhotoKey = post.photo?.key;
    const mentionIds = await validMentionIds(body.mentionIds, viewer.id);
    const oldBodyTags = post.bodyTags ?? [];
    const id = post.id;
    const { fresh, added } = await withTransaction(async (tx) => {
      let photo: Photo | null = post.photo?.key ? post.photo : null;
      if (parsedInput.uploadId) photo = await claimUpload(tx, parsedInput.uploadId, viewer.id);
      else if (parsedInput.removePhoto) photo = null;
      await tx
        .update(posts)
        .set({
          bodyHtml: body.html,
          bodyText: body.text,
          headline: headline || null,
          photo,
          videoId: video?.id ?? null,
          videoStart: video?.start ?? null,
          bodyTags: body.tags,
          mentionIds,
          editedAt: new Date(),
        })
        .where(eq(posts.id, id));
      if (oldBodyTags.join() !== body.tags.join()) await refreshPostTags(id, tx);
      const added = await syncMentions("post", id, viewer.id, mentionIds, tx);
      const [fresh] = await tx.select().from(posts).where(eq(posts.id, id)).limit(1);
      return { fresh, added };
    });
    if (oldPhotoKey && oldPhotoKey !== fresh.photo?.key) await removeStoredFile(oldPhotoKey);
    await notifyMentions({ userIds: added, actor: viewer, entity: "post", entityId: id, text: body.text, href: postHref(id) });

    const [dto] = await postDtos([fresh], viewer);
    return { post: dto };
  });

export const deletePost = authedAction.inputSchema(idSchema).action(async ({ parsedInput, ctx: { viewer } }) => {
  const [post] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, parsedInput.id)).limit(1);
  if (!post) return { deleted: true };
  const own = post.authorId === viewer.id;
  if (!own && !can(viewer, "moderation.review")) throw new AuthError("You can only delete your own posts.");
  await deletePostCascade(parsedInput.id);
  return { deleted: true };
});

export const openContentWarning = authedAction.inputSchema(idSchema).action(async ({ parsedInput, ctx: { viewer } }) => {
  await trackUsage(viewer.id, "content_warning_open", { post: parsedInput.id });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Comments (posts, tips, resources)

export const createComment = permissionAction("community.post")
  .inputSchema(createCommentSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const target = parsedInput.target as CommentTarget;
    if (!canViewTarget(viewer, target.type)) throw new AuthError();
    const resolved = await resolveTarget(target);
    if (!resolved) throw new UserFacingError("This conversation is no longer available.");
    if (!resolved.commentable) throw new UserFacingError("Comments are closed here.");

    const body = prepareUserHtml(parsedInput.html);
    if (body.text.length > COMMENT_MAX_TEXT) {
      throw new UserFacingError(`Comments can be up to ${COMMENT_MAX_TEXT} characters.`);
    }
    const video = parseVideo(parsedInput.videoUrl);
    if (!body.html && !parsedInput.uploadId && !video) throw new UserFacingError("Write something before posting.");
    await assertNotFlooding(viewer.id, "comment");

    const mentionIds = await validMentionIds(body.mentionIds, viewer.id);
    const { comment, added } = await withTransaction(async (tx) => {
      const photo = parsedInput.uploadId ? await claimUpload(tx, parsedInput.uploadId, viewer.id) : null;
      const [comment] = await tx
        .insert(comments)
        .values({
          targetType: target.type,
          targetId: target.id,
          authorId: viewer.id,
          bodyHtml: body.html,
          bodyText: body.text,
          photo,
          videoId: video?.id ?? null,
          videoStart: video?.start ?? null,
          tags: body.tags,
          mentionIds,
        })
        .returning();

      if (target.type === "post") {
        await tx
          .update(posts)
          .set({ commentCount: sql`${posts.commentCount} + 1` })
          .where(eq(posts.id, target.id));
        if (body.tags.length) await refreshPostTags(target.id, tx);
      } else if (body.tags.length) {
        await bumpHashtags(body.tags, [], tx);
      }

      // Tip discussions show up on the wall ("X commented on a thrive tip").
      if (target.type === "tip") {
        await tx.insert(posts).values({
          kind: "tip_comment",
          authorId: viewer.id,
          bodyHtml: body.html,
          bodyText: body.text,
          photo: photo ? { ...photo } : null,
          videoId: video?.id ?? null,
          videoStart: video?.start ?? null,
          tipId: target.id,
          tipCommentId: comment.id,
          tipTitle: resolved.title ?? null,
          createdAt: comment.createdAt,
        });
      }
      const added = await syncMentions("comment", comment.id, viewer.id, mentionIds, tx);
      return { comment, added };
    });
    const id = comment.id;

    const reason = target.type === "post" ? "comment_on_post" : target.type === "tip" ? "comment_on_tip" : "comment_on_resource";
    await Promise.all([
      notifyComment({
        comment: { id, text: body.text },
        target,
        targetAuthorId: resolved.authorId,
        actor: viewer,
      }),
      notifyMentions({
        userIds: added,
        actor: viewer,
        entity: "comment",
        entityId: id,
        text: body.text,
        href: commentHref(target, id),
      }),
      awardCapped(viewer.id, reason, `comment:${id}`),
      target.type === "post" && resolved.authorId && resolved.authorId !== viewer.id
        ? awardCapped(resolved.authorId, "comment_received", `comment-received:${id}`)
        : null,
    ]);

    const [dto] = await commentDtos([comment], viewer);
    return { comment: dto };
  });

export const updateComment = permissionAction("community.post")
  .inputSchema(updateCommentSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const [comment] = await db.select().from(comments).where(eq(comments.id, parsedInput.id)).limit(1);
    if (!comment) throw new UserFacingError("That comment no longer exists.");
    if (comment.authorId !== viewer.id) throw new AuthError("You can only edit your own comments.");

    const body = prepareUserHtml(parsedInput.html);
    if (body.text.length > COMMENT_MAX_TEXT) {
      throw new UserFacingError(`Comments can be up to ${COMMENT_MAX_TEXT} characters.`);
    }
    const video = parseVideo(parsedInput.videoUrl);
    if (!body.html && !(parsedInput.uploadId || (comment.photo?.key && !parsedInput.removePhoto)) && !video) {
      throw new UserFacingError("Write something before saving.");
    }
    const oldPhotoKey = comment.photo?.key;
    const mentionIds = await validMentionIds(body.mentionIds, viewer.id);
    const oldTags = comment.tags ?? [];
    const id = comment.id;
    const target: CommentTarget = { type: comment.targetType, id: comment.targetId };

    const { fresh, added } = await withTransaction(async (tx) => {
      let photo: Photo | null = comment.photo?.key ? comment.photo : null;
      if (parsedInput.uploadId) photo = await claimUpload(tx, parsedInput.uploadId, viewer.id);
      else if (parsedInput.removePhoto) photo = null;
      const editedAt = new Date();
      const [fresh] = await tx
        .update(comments)
        .set({
          bodyHtml: body.html,
          bodyText: body.text,
          photo,
          videoId: video?.id ?? null,
          videoStart: video?.start ?? null,
          tags: body.tags,
          mentionIds,
          editedAt,
        })
        .where(eq(comments.id, id))
        .returning();
      if (target.type === "post" && oldTags.join() !== body.tags.join()) await refreshPostTags(target.id, tx);
      if (target.type === "tip") {
        await tx
          .update(posts)
          .set({
            bodyHtml: body.html,
            bodyText: body.text,
            photo: photo ? { ...photo } : null,
            videoId: video?.id ?? null,
            videoStart: video?.start ?? null,
            editedAt,
          })
          .where(eq(posts.tipCommentId, id));
      }
      const added = await syncMentions("comment", id, viewer.id, mentionIds, tx);
      return { fresh, added };
    });
    if (oldPhotoKey && oldPhotoKey !== fresh.photo?.key) await removeStoredFile(oldPhotoKey);
    await notifyMentions({
      userIds: added,
      actor: viewer,
      entity: "comment",
      entityId: id,
      text: body.text,
      href: commentHref(target, id),
    });
    const [dto] = await commentDtos([fresh], viewer);
    return { comment: dto };
  });

export const deleteComment = authedAction.inputSchema(idSchema).action(async ({ parsedInput, ctx: { viewer } }) => {
  const [comment] = await db
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, parsedInput.id))
    .limit(1);
  if (!comment) return { deleted: true };
  const own = comment.authorId === viewer.id;
  if (!own && !can(viewer, "moderation.review")) throw new AuthError("You can only delete your own comments.");
  await deleteCommentCascade(parsedInput.id);
  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Reactions

/** Sets (kind) or removes (null) the viewer's reaction. One reaction per person per item. */
export const react = permissionAction("community.react")
  .inputSchema(reactSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const { target, kind } = parsedInput;
    const resolved = await resolveTarget(target);
    if (!resolved) throw new UserFacingError("This is no longer available.");
    if (resolved.parent && !canViewTarget(viewer, resolved.parent.type)) throw new AuthError();
    if ((target.type === "tip" || target.type === "resource") && !canViewTarget(viewer, target.type)) throw new AuthError();
    if (resolved.authorId === viewer.id) throw new UserFacingError("You can't react to your own posts.");

    const mine = and(eq(reactions.targetType, target.type), eq(reactions.targetId, target.id), eq(reactions.userId, viewer.id));
    const [previous] = await db.select({ kind: reactions.kind }).from(reactions).where(mine).limit(1);
    if (kind === null) {
      if (previous) {
        await db.delete(reactions).where(mine);
        await retractNotifications(notifyKeys.reaction(target, viewer.id));
      }
    } else if (previous?.kind !== kind) {
      const now = new Date();
      await db
        .insert(reactions)
        .values({
          targetType: target.type,
          targetId: target.id,
          userId: viewer.id,
          kind,
          authorId: resolved.authorId,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [reactions.targetType, reactions.targetId, reactions.userId],
          set: { kind, createdAt: now },
        });
      if (resolved.authorId) {
        if (previous) await retractNotifications(notifyKeys.reaction(target, viewer.id));
        await notifyReaction({ target, authorId: resolved.authorId, actor: viewer, kind, parent: resolved.parent });
      }
      // Points once per person per item (P4), and once per item for its author (P5).
      await Promise.all([
        awardCapped(viewer.id, "reaction_given", `reaction-given:${target.type}:${target.id}`),
        resolved.authorId
          ? awardCapped(resolved.authorId, "reaction_earned", `reaction-earned:${target.type}:${target.id}`)
          : null,
      ]);
    }
    const summary = await getReactionSummary({ ...target, authorId: resolved.authorId }, viewer);
    return { summary };
  });

export const loadReactors = authedAction
  .inputSchema(reactionTargetSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    if (!can(viewer, "community.post")) throw new AuthError();
    return { reactors: await listReactors(parsedInput) };
  });

// ---------------------------------------------------------------------------
// Reports ("Inappropriate") and moderation

async function findReportable(type: "post" | "comment", id: string) {
  const table = type === "post" ? posts : comments;
  const [item] = await db
    .select({ id: table.id, authorId: table.authorId, whitelistedAt: table.whitelistedAt })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return item ?? null;
}

export const reportContent = permissionAction("community.report")
  .inputSchema(reportSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const item = await findReportable(parsedInput.type, parsedInput.id);
    if (!item) throw new UserFacingError("This is no longer available.");
    if (item.authorId === viewer.id) throw new UserFacingError("You can't report your own posts.");
    // A moderator already reviewed and kept it: say thanks, but don't reopen the case.
    if (item.whitelistedAt) return { reported: true };

    await withTransaction(async (tx) => {
      await tx
        .insert(contentReports)
        .values({
          targetType: parsedInput.type,
          targetId: item.id,
          reporterId: viewer.id,
          authorId: item.authorId,
          status: "open",
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [contentReports.targetType, contentReports.targetId, contentReports.reporterId],
          set: { status: "open", createdAt: new Date(), resolvedAt: null, resolvedBy: null },
        });
      await refreshReportCount(parsedInput.type, item.id, tx);
    });
    return { reported: true };
  });

export const moderate = permissionAction("moderation.review")
  .inputSchema(moderateSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const { type, id, action } = parsedInput;
    const resolved = { resolvedAt: new Date(), resolvedBy: viewer.id };
    const openReports = and(eq(contentReports.targetType, type), eq(contentReports.targetId, id), eq(contentReports.status, "open"));

    if (action === "delete") {
      await withTransaction(async (tx) => {
        await tx
          .update(contentReports)
          .set({ status: "removed", ...resolved })
          .where(openReports);
        if (type === "post") await deletePostCascade(id, tx);
        else await deleteCommentCascade(id, tx);
      });
      return { done: action };
    }
    const table = type === "post" ? posts : comments;
    if (action === "clear" || action === "whitelist") {
      await withTransaction(async (tx) => {
        await tx
          .update(contentReports)
          .set({ status: action === "clear" ? "cleared" : "whitelisted", ...resolved })
          .where(openReports);
        await tx
          .update(table)
          .set(action === "whitelist" ? { reportCount: 0, whitelistedAt: new Date(), whitelistedBy: viewer.id } : { reportCount: 0 })
          .where(eq(table.id, id));
      });
      return { done: action };
    }
    await db.update(table).set({ whitelistedAt: null, whitelistedBy: null }).where(eq(table.id, id));
    return { done: action };
  });
