import { eq } from "drizzle-orm";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { profiles } from "@/server/db/schema";
import { signedFileUrl } from "@/server/services/storage";

/**
 * A user's avatar image, for signed-in viewers only. Redirects to the
 * uploaded photo (signed URL) or to the chosen library avatar; 404 when the
 * user has neither, so the UI shows initials instead.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/avatars/[userId]">) {
  const { userId } = await ctx.params;
  if (!isUuid(userId) || !(await getViewer())) return new Response(null, { status: 404 });

  const [profile] = await db
    .select({ photoKey: profiles.photoKey, avatarId: profiles.avatarId })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  let target: string | null = null;
  if (profile?.photoKey) target = await signedFileUrl(profile.photoKey);
  else if (profile?.avatarId) target = `/avatars/${encodeURIComponent(profile.avatarId)}.png`;
  if (!target) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=60" } });

  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "private, max-age=300" },
  });
}
