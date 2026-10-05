/**
 * Client-safe types and constants for the community area (wall posts,
 * comments, reactions, reports). Server code builds these DTOs in
 * `queries.ts`; client components only ever see these shapes.
 */

/** The five reactions shown on the old site, in display order (docs/legacy/03 §5.8). */
export const REACTION_KINDS = ["haha", "love", "thumbs_up", "hundred", "target"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_META: Record<ReactionKind, { label: string; icon: string }> = {
  haha: { label: "Haha", icon: "/reactions/haha.svg" },
  love: { label: "Love", icon: "/reactions/love.svg" },
  thumbs_up: { label: "Thumbs up", icon: "/reactions/thumbs_up.svg" },
  hundred: { label: "100", icon: "/reactions/hundred.svg" },
  target: { label: "Proud", icon: "/reactions/target.svg" },
};

/** What comments can hang off. Tips and resources reuse the comment thread. */
export const COMMENT_TARGET_TYPES = ["post", "tip", "resource"] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

/** What can be reacted to. */
export const REACTION_TARGET_TYPES = ["post", "comment", "tip", "resource"] as const;
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];

/** What can be reported as inappropriate. */
export const REPORT_TARGET_TYPES = ["post", "comment"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export type CommentTarget = { type: CommentTargetType; id: string };
export type ReactionTarget = { type: ReactionTargetType; id: string };

export type ReactionCounts = Record<ReactionKind, number>;

export type ReactionSummary = {
  target: ReactionTarget;
  counts: ReactionCounts;
  total: number;
  /** The viewer's own reaction, if any. */
  mine: ReactionKind | null;
  /** False on the viewer's own content or without the react permission. */
  canReact: boolean;
  /** Why the viewer can't react (shown as a hint). */
  reason?: "own" | "permission";
};

export type AuthorDTO = { id: string; name: string; username: string };

export type PhotoDTO = { url: string; width?: number; height?: number; gif: boolean };
export type VideoDTO = { id: string; start?: number };

export type CommentDTO = {
  id: string;
  target: CommentTarget;
  author: AuthorDTO;
  /** Rendered, safe HTML (mentions and hashtags linked). */
  html: string;
  /** Stored editor HTML, for editing. */
  sourceHtml: string;
  createdAt: string;
  editedAt: string | null;
  photo: PhotoDTO | null;
  video: VideoDTO | null;
  reactions: ReactionSummary;
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  reported: boolean;
};

export type TipMirrorDTO = { tipId: string; commentId: string; tipTitle: string | null; href: string };

export type PostDTO = {
  id: string;
  kind: "post" | "tip_comment";
  author: AuthorDTO;
  html: string;
  sourceHtml: string;
  /** Content warning / headline ("!Headline!"): hides the body until opened. */
  headline: string | null;
  createdAt: string;
  editedAt: string | null;
  /** Created by someone else since the viewer's previous wall visit. */
  isNew: boolean;
  photo: PhotoDTO | null;
  video: VideoDTO | null;
  tags: string[];
  reactions: ReactionSummary;
  commentCount: number;
  comments: CommentDTO[];
  canComment: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  reported: boolean;
  tipComment: TipMirrorDTO | null;
};

/** The signed-in person, as client components need them. */
export type ViewerDTO = { id: string; name: string; username: string };

export type Reactor = { user: AuthorDTO; kind: ReactionKind };

/** Upload handle returned by POST /api/community/uploads. */
export type UploadDTO = { id: string; url: string; width?: number; height?: number; gif: boolean };

export const POST_MAX_TEXT = 5000;
export const COMMENT_MAX_TEXT = 2000;
export const HEADLINE_MAX = 120;
export const FEED_PAGE_SIZE = 8;
