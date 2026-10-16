/**
 * The app has two separately signed-in areas ("portals"), each with its own
 * session cookie, so a staff member and a participant can be signed in side
 * by side in the same browser without one session replacing the other:
 *
 * - staff:  /admin, /coach, /account (staff, coordinators, peer navigators)
 * - member: everything else (Link Positively and Peer Navigation participants)
 *
 * A session only counts in the portal that matches the account's roles (see
 * `portalForRoles`), so a participant can never reach the staff area and staff
 * can never use the participant app (except through impersonation, which signs
 * the member portal in as the participant being viewed).
 *
 * Edge-safe: used by the proxy.
 */

export type Portal = "staff" | "member";

export const PORTAL_HEADER = "x-lp-portal";

export const PORTAL_COOKIE_PREFIX: Record<Portal, string> = { member: "lp", staff: "lp-staff" };

export const PORTAL_AUTH_PATH: Record<Portal, string> = { member: "/api/auth", staff: "/api/staff-auth" };

const STAFF_PATHS = ["/admin", "/coach", "/account", PORTAL_AUTH_PATH.staff];

/** Pages and endpoints any visitor (or either portal) may use; their portal comes from the referring page. */
const SHARED_PATHS = ["/login", "/forgot-password", "/reset-password", "/logout", "/start", "/r", "/legacy", "/api"];

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Which portal a path belongs to, or null for shared paths. */
export function portalForPath(pathname: string): Portal | null {
  if (STAFF_PATHS.some((prefix) => under(pathname, prefix))) return "staff";
  if (under(pathname, PORTAL_AUTH_PATH.member)) return "member";
  if (SHARED_PATHS.some((prefix) => under(pathname, prefix))) return null;
  return "member";
}
