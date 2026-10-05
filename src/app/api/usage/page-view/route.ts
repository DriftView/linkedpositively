import { getViewer } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

/**
 * Records a page view for the study reports (the old site counted every page
 * request for "days with access"). Only the path is stored, without query
 * strings, and only for signed-in people.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path.split("?")[0].slice(0, 200) : "";
  if (!path.startsWith("/")) return new Response(null, { status: 204 });
  await trackUsage(viewer.id, "page_view", { path });
  return new Response(null, { status: 204 });
}
