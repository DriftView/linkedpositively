import "server-only";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getAuthors } from "@/features/community/queries";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { comments, posts, reactions } from "@/server/db/schema";
import { containsPattern, highlight, searchWords, wordsRegex } from "./text";
import type { PostHit } from "./types";

const PAGE_SIZE = 10;
const MAX_MATCHES = 300;

/**
 * Wall search: posts whose text (or content-warning headline) contains all
 * the words, plus posts with a comment that does. Fixes the old search,
 * which matched posts by any word but comments only by exact text, and
 * repeated a post once per matching comment (docs/legacy/03 §10, §14).
 */
export async function searchPosts(viewer: Viewer, q: string, options: { page?: number } = {}) {
  const words = searchWords(q);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  if (!words.length || !can(viewer, "community.post")) return { items: [] as PostHit[], total: 0, page, pageCount: 0 };

  const patterns = words.map(containsPattern);
  const [postMatches, commentMatches] = await Promise.all([
    db
      .select({ id: posts.id })
      .from(posts)
      .where(and(...patterns.map((pattern) => or(ilike(posts.bodyText, pattern), ilike(posts.headline, pattern)))))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(MAX_MATCHES),
    db
      .select({ targetId: comments.targetId, bodyText: comments.bodyText, authorId: comments.authorId })
      .from(comments)
      .where(and(eq(comments.targetType, "post"), ...patterns.map((pattern) => ilike(comments.bodyText, pattern))))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(MAX_MATCHES),
  ]);

  const commentFor = new Map<string, (typeof commentMatches)[number]>();
  for (const comment of commentMatches) if (!commentFor.has(comment.targetId)) commentFor.set(comment.targetId, comment);
  const ids = [...new Set([...postMatches.map((post) => post.id), ...commentFor.keys()])];
  const docs = ids.length
    ? await db
        .select({
          id: posts.id,
          authorId: posts.authorId,
          bodyText: posts.bodyText,
          headline: posts.headline,
          createdAt: posts.createdAt,
          commentCount: posts.commentCount,
          photo: posts.photo,
          videoId: posts.videoId,
          kind: posts.kind,
        })
        .from(posts)
        .where(inArray(posts.id, ids))
        .orderBy(desc(posts.createdAt), desc(posts.id))
    : [];

  const total = docs.length;
  const slice = docs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [author, reactionTotals] = await Promise.all([
    getAuthors([
      ...slice.map((doc) => doc.authorId),
      ...slice.flatMap((doc) => {
        const comment = commentFor.get(doc.id);
        return comment ? [comment.authorId] : [];
      }),
    ]),
    slice.length
      ? db
          .select({ id: reactions.targetId, n: count() })
          .from(reactions)
          .where(
            and(
              eq(reactions.targetType, "post"),
              inArray(
                reactions.targetId,
                slice.map((doc) => doc.id),
              ),
            ),
          )
          .groupBy(reactions.targetId)
      : Promise.resolve([]),
  ]);
  const reactionCounts = new Map(reactionTotals.map((row) => [row.id, row.n]));

  const regexes = words.map((word) => wordsRegex(word));
  const items: PostHit[] = slice.map((doc) => {
    const id = doc.id;
    const comment = commentFor.get(id);
    const inBody = regexes.every((regex) => regex.test(doc.bodyText ?? "") || regex.test(doc.headline ?? ""));
    return {
      id,
      author: author(doc.authorId),
      createdAt: doc.createdAt.toISOString(),
      headline: doc.headline ?? null,
      // Content-warning posts only show their headline in results.
      excerpt: doc.headline ? [] : highlight(doc.bodyText ?? "", words),
      hasPhoto: Boolean(doc.photo?.key),
      hasVideo: Boolean(doc.videoId),
      commentCount: doc.commentCount ?? 0,
      reactionCount: reactionCounts.get(id) ?? 0,
      tipComment: doc.kind === "tip_comment",
      comment:
        comment && !inBody
          ? { author: author(comment.authorId), excerpt: highlight(comment.bodyText ?? "", words, 120) }
          : null,
    };
  });
  return { items, total, page, pageCount: Math.ceil(total / PAGE_SIZE) };
}
