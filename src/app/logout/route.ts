import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";

/**
 * Signs the visitor out and returns them to the login page. Only POST changes
 * state; GET (old /user/logout links) shows the login page without signing
 * anyone out, so a link can't log people out behind their back.
 */
export async function POST(request: Request) {
  const response = await auth.api.signOut({ headers: await headers(), asResponse: true });
  const redirect = NextResponse.redirect(new URL("/login", request.url), 303);
  for (const cookie of response.headers.getSetCookie()) redirect.headers.append("Set-Cookie", cookie);
  return redirect;
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url), 307);
}
