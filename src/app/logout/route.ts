import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { memberAuth, staffAuth } from "@/server/auth/auth";

/**
 * Signs the visitor out of both portals and returns them to the login page.
 * Only POST changes state; GET (old /user/logout links) shows the login page
 * without signing anyone out, so a link can't log people out behind their back.
 */
export async function POST(request: Request) {
  const requestHeaders = await headers();
  const redirect = NextResponse.redirect(new URL("/login", request.url), 303);
  for (const instance of [memberAuth, staffAuth]) {
    const response = await instance.api.signOut({ headers: requestHeaders, asResponse: true }).catch(() => null);
    for (const cookie of response?.headers.getSetCookie() ?? []) redirect.headers.append("Set-Cookie", cookie);
  }
  return redirect;
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url), 307);
}
