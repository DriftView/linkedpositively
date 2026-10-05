import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirect: signed-out visitors go to the login page and come
 * back to where they were headed (important for links in SMS reminders).
 * This only checks that a session cookie exists; pages and actions still
 * verify the session for real (src/server/auth/session.ts).
 */

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/r/", "/logout"];

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  // Links in texts sent by the old site carried ?sms=<uid>:<week>. Record the
  // click (the handler checks it against the signed-in user) and continue.
  const sms = searchParams.get("sms");
  if (sms && !pathname.startsWith("/r/")) {
    const rest = new URLSearchParams(searchParams);
    rest.delete("sms");
    const next = pathname + (rest.size ? `?${rest}` : "");
    const url = request.nextUrl.clone();
    url.pathname = "/r/legacy";
    url.search = `?sms=${encodeURIComponent(sms)}&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))) return NextResponse.next();

  if (!getSessionCookie(request, { cookiePrefix: "lp" })) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals and static files (matched by extension).
  matcher: ["/((?!api/|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|pdf|ico|txt|webmanifest)$).*)"],
};
