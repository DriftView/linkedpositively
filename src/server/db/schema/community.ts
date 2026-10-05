import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  createdAt,
  enumCheck,
  id,
  legacyColumns,
  legacyConstraints,
  timestamps,
  tstz,
  updatedAt,
  type Photo,
} from "./_shared";
import { users } from "./auth";
import { tips } from "./tips";

export const POST_KINDS = ["post", "tip_comment"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/**
 * A wall post (Drupal node type `drupal_wall`, docs/legacy/03 §3.1).
 *
 * `kind: "tip_comment"` is the old `tip-notification` post: a mirror of a
 * comment on a Thrive Tip, shown on the wall ("X commented on a thrive tip").
 * Its reactions belong to the mirrored comment (`tipCommentId`).
 * Reaction counts are aggregated from the `reactions` table (one source of truth).
 *
 * Legacy mapping: title → derived, body → bodyHtml, field_drupal_wall_photos
 * → photo, field_drupal_wall_videos → videoId, field_post_bg → postBg,
 * field_youthrive_tags → tags, field_comment_id → tipCommentId,
 * a title/body starting with "!Headline!" → headline.
 *
 * Mongo → Postgres: the `tipComment: { tipId, commentId, tipTitle }` subdocument
 * is flattened into `tipId`, `tipCommentId`, `tipTitle` (all null for normal posts).
 */
export const posts = pgTable(
  "posts",
  {
    id: id(),
    kind: text().$type<PostKind>().notNull().default("post"),
    /** Null once the author's account is deleted (shown as "Former member"). */
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Sanitized editor HTML (mentions/hashtags as spans). */
    bodyHtml: text().notNull().default(""),
    /** Plain text of the body, for search, excerpts and SMS. */
    bodyText: text().notNull().default(""),
    /** Content warning / headline (legacy "!Headline!" convention). */
    headline: text(),
    photo: jsonb().$type<Photo>(),
    /** YouTube video id (11 chars) and optional start second. */
    videoId: text(),
    videoStart: integer(),
    /** Legacy post background class (field_post_bg); kept for the migration. */
    postBg: text(),
    /** Lower-cased hashtags from the body and from the post's comments. GIN-indexed. */
    tags: text().array().notNull().default([]),
    /** Hashtags from the body only (tags = bodyTags ∪ comment tags). */
    bodyTags: text().array().notNull().default([]),
    /** Users mentioned in the body (the `mentions` table is the queryable copy). */
    mentionIds: uuid().array().notNull().default([]),
    /** tip_comment posts: the tip, the mirrored comment and the tip title at the time. */
    tipId: uuid().references(() => tips.id, { onDelete: "cascade" }),
    tipCommentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    tipTitle: text(),
    commentCount: integer().notNull().default(0),
    /** Open abuse reports (moderation queue). */
    reportCount: integer().notNull().default(0),
    lastReportedAt: tstz(),
    /** A moderator said this is fine: further reports are ignored. */
    whitelistedAt: tstz(),
    whitelistedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    editedAt: tstz(),
    createdAt: createdAt(),
    ...updatedAt(),
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("posts", t),
    index("posts_created_idx").on(t.createdAt.desc(), t.id.desc()),
    index("posts_author_created_idx").on(t.authorId, t.createdAt.desc(), t.id.desc()),
    index("posts_tags_gin").using("gin", t.tags),
    index("posts_tip_comment_idx")
      .on(t.tipCommentId)
      .where(sql`${t.tipCommentId} is not null`),
    index("posts_report_idx").on(t.reportCount, t.lastReportedAt.desc()),
    enumCheck("posts_kind_ck", t.kind, POST_KINDS),
  ],
);

export const COMMENT_TARGET_TYPES = ["post", "tip", "resource"] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

/**
 * A comment on a wall post, a Thrive Tip or a resource (Drupal core
 * `comment` on drupal_wall / thrive_tips / resources, docs/legacy/03 §3.2).
 * Flat: the old site never used replies. Editing keeps author and date.
 * Legacy mapping: comment_body → bodyHtml, field_comment_image → photo,
 * field_comment_videos → videoId.
 *
 * `targetId` is polymorphic (posts / tips / resources by `targetType`), so it has
 * no foreign key: delete a target's comments in the same transaction.
 */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    targetType: text().$type<CommentTargetType>().notNull(),
    targetId: uuid().notNull(),
    /** Null once the author's account is deleted (shown as "Former member"). */
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    bodyHtml: text().notNull().default(""),
    bodyText: text().notNull().default(""),
    photo: jsonb().$type<Photo>(),
    videoId: text(),
    videoStart: integer(),
    tags: text().array().notNull().default([]),
    mentionIds: uuid().array().notNull().default([]),
    reportCount: integer().notNull().default(0),
    lastReportedAt: tstz(),
    whitelistedAt: tstz(),
    whitelistedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    editedAt: tstz(),
    createdAt: createdAt(),
    ...updatedAt(),
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("comments", t),
    index("comments_target_created_idx").on(t.targetType, t.targetId, t.createdAt),
    index("comments_author_created_idx").on(t.authorId, t.createdAt.desc()),
    index("comments_report_idx").on(t.reportCount, t.lastReportedAt.desc()),
    enumCheck("comments_target_type_ck", t.targetType, COMMENT_TARGET_TYPES),
  ],
);

export const REACTION_TARGET_TYPES = ["post", "comment", "tip", "resource"] as const;
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];
export const REACTION_KINDS = ["haha", "love", "thumbs_up", "hundred", "target"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/**
 * One person's reaction to one item (post, comment, tip or resource).
 * One reaction per user per item (legacy flags haha/love/thumbs_up/fire/
 * target + `uy_wallflag_count`, docs/legacy/03 §5.8). Counts are
 * denormalised on posts and comments. `targetId` is polymorphic (no FK).
 */
export const reactions = pgTable(
  "reactions",
  {
    id: id(),
    targetType: text().$type<ReactionTargetType>().notNull(),
    targetId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Author of the item at reaction time (notifications, reports). */
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: text().$type<ReactionKind>().notNull(),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("reactions", t),
    uniqueIndex("reactions_target_user_uq").on(t.targetType, t.targetId, t.userId),
    index("reactions_target_created_idx").on(t.targetType, t.targetId, t.createdAt.desc()),
    index("reactions_user_created_idx").on(t.userId, t.createdAt.desc()),
    enumCheck("reactions_target_type_ck", t.targetType, REACTION_TARGET_TYPES),
    enumCheck("reactions_kind_ck", t.kind, REACTION_KINDS),
  ],
);

export const MENTION_ENTITY_TYPES = ["post", "comment"] as const;
export type MentionEntityType = (typeof MENTION_ENTITY_TYPES)[number];

/**
 * "@someone" in a post or comment (contrib `mentions` table). Kept as its own
 * table so "Tagged by…" lists and reports can query it. `entityId` is polymorphic (no FK).
 */
export const mentions = pgTable(
  "mentions",
  {
    id: id(),
    entityType: text().$type<MentionEntityType>().notNull(),
    entityId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("mentions", t),
    uniqueIndex("mentions_entity_user_uq").on(t.entityType, t.entityId, t.userId),
    index("mentions_user_created_idx").on(t.userId, t.createdAt.desc()),
    enumCheck("mentions_entity_type_ck", t.entityType, MENTION_ENTITY_TYPES),
  ],
);

export const CONTENT_REPORT_TARGET_TYPES = ["post", "comment"] as const;
export type ContentReportTargetType = (typeof CONTENT_REPORT_TARGET_TYPES)[number];
export const CONTENT_REPORT_STATUSES = ["open", "cleared", "whitelisted", "removed"] as const;
export type ContentReportStatus = (typeof CONTENT_REPORT_STATUSES)[number];

/**
 * "Inappropriate" report on a post or comment (legacy flags abuse_node /
 * abuse_comment). One per reporter per item; participants cannot retract.
 * Moderators resolve reports by deleting the content, clearing them, or
 * whitelisting the item (docs/legacy/03 §5.9). `targetId` is polymorphic (no FK).
 */
export const contentReports = pgTable(
  "content_reports",
  {
    id: id(),
    targetType: text().$type<ContentReportTargetType>().notNull(),
    targetId: uuid().notNull(),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Author of the reported item (denormalised for the queue). */
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    status: text().$type<ContentReportStatus>().notNull().default("open"),
    resolvedAt: tstz(),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("content_reports", t),
    uniqueIndex("content_reports_target_reporter_uq").on(t.targetType, t.targetId, t.reporterId),
    index("content_reports_status_idx").on(t.status, t.targetType, t.createdAt.desc()),
    enumCheck("content_reports_target_type_ck", t.targetType, CONTENT_REPORT_TARGET_TYPES),
    enumCheck("content_reports_status_ck", t.status, CONTENT_REPORT_STATUSES),
  ],
);

/**
 * A hashtag used on the wall (vocabulary `youthrive_tags`). Posts hold their
 * tags in `posts.tags`; this table powers autocomplete and counts.
 * `name` is lower-cased and trimmed by the app before writing.
 */
export const hashtags = pgTable(
  "hashtags",
  {
    id: id(),
    name: text().notNull().unique(),
    useCount: integer().notNull().default(0),
    lastUsedAt: tstz(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("hashtags", t),
    index("hashtags_use_count_idx").on(t.useCount.desc()),
    // Prefix autocomplete: `like 'abc%'`.
    index("hashtags_name_pattern_idx").on(sql`${t.name} text_pattern_ops`),
  ],
);

/**
 * An image uploaded from the post or comment composer, before it is attached.
 * Lets actions check that the uploader owns the file; unattached uploads are
 * deleted by a daily job (features/community/jobs.ts).
 */
export const communityUploads = pgTable(
  "community_uploads",
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text().notNull(),
    type: text().notNull(),
    width: integer(),
    height: integer(),
    attachedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index("community_uploads_attached_created_idx").on(t.attachedAt, t.createdAt)],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;
export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
export type Hashtag = typeof hashtags.$inferSelect;
export type NewHashtag = typeof hashtags.$inferInsert;
export type CommunityUpload = typeof communityUploads.$inferSelect;
export type NewCommunityUpload = typeof communityUploads.$inferInsert;
