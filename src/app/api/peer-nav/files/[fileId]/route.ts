import { eq } from "drizzle-orm";
import { fileSpaceAccess } from "@/features/peer-nav/access";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { pnFiles } from "@/server/db/schema";
import { signedFileUrl } from "@/server/services/storage";

/** Downloads a shared file: checks access, then redirects to a short-lived signed URL. */
export async function GET(_request: Request, ctx: RouteContext<"/api/peer-nav/files/[fileId]">) {
  const { fileId } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer || !isUuid(fileId)) return new Response("Not found", { status: 404 });
  const [file] = await db.select().from(pnFiles).where(eq(pnFiles.id, fileId)).limit(1);
  if (!file || !(await fileSpaceAccess(viewer, file.participantId))) return new Response("Not found", { status: 404 });
  const url = await signedFileUrl(file.storageKey, file.filename);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
}
