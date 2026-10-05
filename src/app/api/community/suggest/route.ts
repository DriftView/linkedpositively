import { NextResponse } from "next/server";
import { can, getViewer } from "@/server/auth/session";
import { suggestPeople, suggestTags } from "@/features/community/queries";

/**
 * Autocomplete for the composer: `?type=people&q=sa` (@mentions) and
 * `?type=tags&q=se` (#hashtags). A route handler rather than a Server Action
 * so fast typing isn't queued behind other actions.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "community.post")) return NextResponse.json({ items: [] }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 40);
  const headers = { "Cache-Control": "private, max-age=30" };
  if (params.get("type") === "tags") {
    return NextResponse.json({ items: await suggestTags(q) }, { headers });
  }
  return NextResponse.json({ items: await suggestPeople(viewer, q) }, { headers });
}
