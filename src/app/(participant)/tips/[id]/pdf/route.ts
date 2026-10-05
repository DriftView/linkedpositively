import { NextResponse } from "next/server";
import { tipForViewer } from "@/features/tips/queries";
import { getViewer, can } from "@/server/auth/session";
import { signedFileUrl } from "@/server/services/storage";

/** Opens a tip's PDF after checking the viewer may see the tip (files are private). */
export async function GET(request: Request, { params }: RouteContext<"/tips/[id]/pdf">) {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "tips.view")) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const found = await tipForViewer(viewer, id);
  if (!found?.pdfKey) return new NextResponse("Not found", { status: 404 });
  const url = await signedFileUrl(found.pdfKey);
  return NextResponse.redirect(new URL(url, request.url), { status: 303 });
}
