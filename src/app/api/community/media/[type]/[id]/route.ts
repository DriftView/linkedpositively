import { eq } from "drizzle-orm";
import { can, getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { comments, posts } from "@/server/db/schema";
import { canViewTarget } from "@/features/community/queries";
import { signedFileUrl } from "@/server/services/storage";
import type { CommentTargetType } from "@/features/community/types";

/**
 * Photo of a post or comment, for signed-in viewers who can see it. Redirects
 * to a short-lived signed URL so image links in the feed never expire.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/community/media/[type]/[id]">) {
  const { type, id } = await ctx.params;
  const notFound = () => new Response(null, { status: 404 });
  if (!isUuid(id) || (type !== "post" && type !== "comment")) return notFound();

  const viewer = await getViewer();
  if (!viewer) return notFound();

  let key: string | undefined;
  if (type === "post") {
    if (!can(viewer, "community.post")) return notFound();
    const [post] = await db.select({ photo: posts.photo }).from(posts).where(eq(posts.id, id)).limit(1);
    key = post?.photo?.key;
  } else {
    const [comment] = await db
      .select({ photo: comments.photo, targetType: comments.targetType })
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);
    if (!comment || !canViewTarget(viewer, comment.targetType as CommentTargetType)) return notFound();
    key = comment.photo?.key;
  }
  if (!key) return notFound();

  return new Response(null, {
    status: 302,
    headers: { Location: await signedFileUrl(key), "Cache-Control": "private, max-age=600" },
  });
}
