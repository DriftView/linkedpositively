import { eq } from "drizzle-orm";
import { PORTAL_AUTH_PATH, portalForPath, type Portal } from "@/lib/portal";
import { safeInternalPath } from "@/lib/safe-path";
import { authFor } from "@/server/auth/auth";
import { homePathFor, parseRoles, portalForRoles, type Role } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

/**
 * Signs in to the portal the account belongs to (src/lib/portal.ts): staff get
 * the staff session cookie, participants the member one, so both can be signed
 * in in one browser. The request is forwarded to that portal's Better Auth
 * endpoint, which keeps its rate limiting, ban checks and sign-in hooks.
 * Unknown logins go to the member portal and fail there the usual way, so the
 * response never says which portal (or whether) an account exists.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { identifier?: unknown; password?: unknown; next?: unknown } | null;
  const login = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!login || !password) return Response.json({ message: null }, { status: 400 });

  const byEmail = login.includes("@");
  const [account] = await db
    .select({ role: users.role })
    .from(users)
    .where(byEmail ? eq(users.email, login.toLowerCase()) : eq(users.username, login.toLowerCase()))
    .limit(1);
  const roles = parseRoles(account?.role);
  const portal = portalForRoles(roles);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("content-type", "application/json");
  forwardHeaders.delete("content-length");
  const url = new URL(`${PORTAL_AUTH_PATH[portal]}/sign-in/${byEmail ? "email" : "username"}`, request.url);
  const response = await authFor(portal).handler(
    new Request(url, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(byEmail ? { email: login, password } : { username: login, password }),
    }),
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    return Response.json({ message: error?.message ?? null }, { status: response.status });
  }

  const result = Response.json({ portal, destination: destinationFor(body?.next, portal, roles) });
  for (const cookie of response.headers.getSetCookie()) result.headers.append("set-cookie", cookie);
  return result;
}

/** The requested page when it's in the portal they signed in to, otherwise their home page. */
function destinationFor(next: unknown, portal: Portal, roles: Role[]) {
  const path = safeInternalPath(typeof next === "string" ? next : null, "");
  const pathname = path.split(/[?#]/)[0];
  if (pathname && pathname !== "/start" && portalForPath(pathname) === portal) return path;
  if (pathname.startsWith("/r/") || pathname.startsWith("/legacy/")) return path;
  return homePathFor(roles);
}
