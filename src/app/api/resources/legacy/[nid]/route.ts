import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { resources } from "@/server/db/schema";

/**
 * Target for the legacy redirect /location/:nid → /api/resources/legacy/:nid.
 * Finds the migrated resource by its Drupal node id.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/resources/legacy/[nid]">) {
  const { nid } = await context.params;
  const id = Number(nid);
  if (!(await getViewer()))
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/location/${nid}`)}`, request.url));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.redirect(new URL("/resources", request.url));
  const [resource] = await db
    .select({ id: resources.id })
    .from(resources)
    .where(and(eq(resources.legacySite, "lp"), eq(resources.legacyId, id)))
    .limit(1);
  return NextResponse.redirect(new URL(resource ? `/resources/${resource.id}` : "/resources", request.url));
}
