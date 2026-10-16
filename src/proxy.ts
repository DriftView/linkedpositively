import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { PORTAL_COOKIE_PREFIX, PORTAL_HEADER, portalForPath, type Portal } from "@/lib/portal";

/**
 * 1. Tags every request with its portal (src/lib/portal.ts) so the server reads
 *    the right session cookie. Shared routes (avatars, files, uploads) take the
 *    portal of the page that requested them.
 * 2. Optimistic auth redirect: signed-out visitors go to the login page and
 *    come back to where they were headed (important for links in SMS
 *    reminders). This only checks that the portal's session cookie exists;
 *    pages and actions still verify the session for real
 *    (src/server/auth/session.ts).
 */

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/r/", "/logout"];

function refererPortal(request: NextRequest): Portal | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin === request.nextUrl.origin ? portalForPath(url.pathname) : null;
  } catch {
    return null;
  }
}

const hasSession = (request: NextRequest, portal: Portal) =>
  Boolean(getSessionCookie(request, { cookiePrefix: PORTAL_COOKIE_PREFIX[portal] }));

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  // Links in texts sent by the old site carried ?sms=<uid>:<week>. Record the
  // click (the handler checks it against the signed-in user) and continue.
  const sms = searchParams.get("sms");
  if (sms && !pathname.startsWith("/r/") && !pathname.startsWith("/api/")) {
    const rest = new URLSearchParams(searchParams);
    rest.delete("sms");
    const next = pathname + (rest.size ? `?${rest}` : "");
    const url = request.nextUrl.clone();
    url.pathname = "/r/legacy";
    url.search = `?sms=${encodeURIComponent(sms)}&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }

  const pathPortal = portalForPath(pathname);
  const portal = pathPortal ?? refererPortal(request);
  const requestHeaders = new Headers(request.headers);
  // Always overwritten, so a client can't pick the portal for a staff path.
  if (portal) requestHeaders.set(PORTAL_HEADER, portal);
  else requestHeaders.delete(PORTAL_HEADER);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (pathname.startsWith("/api/")) return pass();
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))) return pass();

  const signedIn = pathPortal ? hasSession(request, pathPortal) : hasSession(request, "member") || hasSession(request, "staff");
  if (!signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return pass();
}

export const config = {
  // Everything except Next internals and static files (matched by extension).
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|pdf|ico|txt|webmanifest)$).*)"],
};
