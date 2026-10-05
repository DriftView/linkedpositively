import { NextResponse } from "next/server";
import { findPostIdByLegacyNid } from "@/features/community/queries";
import { getViewer } from "@/server/auth/session";

/**
 * Old Drupal post links: /wall-post/{nid} and /post/{nid}/edit are
 * redirected here (next.config) and resolved to the migrated post.
 * `?edit=1` opens the editor. Unknown posts go to the wall.
 */
export async function GET(request: Request, ctx: RouteContext<"/posts/legacy/[nid]">) {
  const url = new URL(request.url);
  if (!(await getViewer())) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url));
  const { nid } = await ctx.params;
  const id = /^\d{1,10}$/.test(nid) ? await findPostIdByLegacyNid(Number(nid)) : null;
  if (!id) return NextResponse.redirect(new URL("/", url));
  const target = new URL(`/posts/${id}`, url);
  if (url.searchParams.get("edit") === "1") target.searchParams.set("edit", "1");
  target.hash = url.hash;
  return NextResponse.redirect(target);
}
