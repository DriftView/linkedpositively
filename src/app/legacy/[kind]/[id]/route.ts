import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { pages, posts, resources, tips, users } from "@/server/db/schema";

/**
 * Resolves old Drupal ids to new pages: /legacy/node/:nid (wall posts, tips,
 * resources, info pages) and /legacy/user/:uid (profiles). Reached through the
 * redirects in src/server/legacy-redirects.ts.
 */
export async function GET(request: Request, ctx: RouteContext<"/legacy/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const nid = Number(id);
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 308);
  if (!Number.isInteger(nid) || nid <= 0) return to("/");

  const viewer = await getViewer();
  if (!viewer) return to(`/login?next=${encodeURIComponent(new URL(request.url).pathname)}`);

  if (kind === "user") {
    const [user] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(and(eq(users.legacySite, "lp"), eq(users.legacyId, nid)))
      .limit(1);
    if (!user?.username) return to("/");
    return to(user.id === viewer.id ? "/profile" : `/people/${encodeURIComponent(user.username)}`);
  }

  if (kind === "node") {
    const [[post], [tip], [resource], [page]] = await Promise.all([
      db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.legacySite, "lp"), eq(posts.legacyId, nid)))
        .limit(1),
      db
        .select({ id: tips.id })
        .from(tips)
        .where(and(eq(tips.legacySite, "lp"), eq(tips.legacyId, nid)))
        .limit(1),
      db
        .select({ id: resources.id })
        .from(resources)
        .where(and(eq(resources.legacySite, "lp"), eq(resources.legacyId, nid)))
        .limit(1),
      db
        .select({ slug: pages.slug })
        .from(pages)
        .where(and(eq(pages.legacyTable, "node"), eq(pages.legacyId, nid)))
        .limit(1),
    ]);
    if (post) return to(`/posts/${post.id}`);
    if (tip) return to(`/tips/${tip.id}`);
    if (resource) return to(`/resources/${resource.id}`);
    if (page?.slug) return to(`/pages/${page.slug}`);
  }
  return to("/");
}
