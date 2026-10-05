import type { CommentTarget, ReactionTarget } from "./types";

/**
 * URLs of community things, in one place so other areas (and the legacy
 * redirects) agree on them. Client-safe.
 */
/** Public profile page (profiles live at /people/{username}; the id works when there's no username). */
export const profileHref = (person: { id: string; username?: string | null }) =>
  `/people/${encodeURIComponent(person.username || person.id)}`;
export const postHref = (postId: string) => `/posts/${postId}`;
export const tagHref = (tag: string) => `/search?tag=${encodeURIComponent(tag)}`;
export const searchHref = (q: string) => `/search?q=${encodeURIComponent(q)}`;
export const tipHref = (tipId: string) => `/tips/${tipId}`;
export const resourceHref = (resourceId: string) => `/resources/${resourceId}`;

/** The page that shows a comment target. */
export function targetHref(target: CommentTarget | ReactionTarget) {
  if (target.type === "post") return postHref(target.id);
  if (target.type === "tip") return tipHref(target.id);
  if (target.type === "resource") return resourceHref(target.id);
  return "/";
}

export const commentAnchor = (commentId: string) => `comment-${commentId}`;

export function commentHref(target: CommentTarget, commentId: string) {
  return `${targetHref(target)}#${commentAnchor(commentId)}`;
}

export const postMediaUrl = (postId: string, version: string) => `/api/community/media/post/${postId}?v=${version}`;
export const commentMediaUrl = (commentId: string, version: string) =>
  `/api/community/media/comment/${commentId}?v=${version}`;
