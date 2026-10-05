import { NextResponse } from "next/server";
import { getMyCoach } from "@/features/peer-nav/queries";
import { can, getViewer } from "@/server/auth/session";

/**
 * "Launch Zoom" (legacy Participant-menu item rewritten to the coach's
 * field_zoom_link). Redirects to the assigned coach's Zoom link, or to the
 * My coach page when there isn't one (the old link broke then).
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login?next=/coaching/zoom", request.url));
  if (!can(viewer, "peernav.participant")) return NextResponse.redirect(new URL("/", request.url));
  const coach = await getMyCoach(viewer.id);
  if (!coach?.zoomLink) return NextResponse.redirect(new URL("/coaching/coach", request.url));
  return NextResponse.redirect(coach.zoomLink);
}
