import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { PORTAL_HEADER, type Portal } from "@/lib/portal";
import { authFor } from "./auth";
import {
  hasPermission,
  homePathFor,
  isStaff,
  parseRoles,
  permissionsFor,
  portalForRoles,
  primaryRoleLabel,
  type Permission,
  type Role,
} from "./roles";

/**
 * Data access layer for "who is asking". Every page, Server Action and Route
 * Handler goes through these helpers; never trust the client for identity.
 */

export type Viewer = {
  id: string;
  name: string;
  username: string;
  email: string;
  image: string | null;
  roles: Role[];
  permissions: Set<Permission>;
  roleLabel: string;
  staff: boolean;
  timezone: string;
  programs: string[];
  impersonatedBy: string | null;
};

/**
 * The portal this request belongs to, set by the proxy from the path (or, for
 * shared routes such as /api/avatars, from the referring page). Null when the
 * proxy couldn't tell; then either portal's session may answer.
 */
export const getRequestPortal = cache(async (): Promise<Portal | null> => {
  const value = (await headers()).get(PORTAL_HEADER);
  return value === "staff" || value === "member" ? value : null;
});

/**
 * The person signed in to one portal. A session whose account belongs to the
 * other portal is ignored, so a participant can't use the staff area and staff
 * can't use the participant app.
 */
export const getViewerIn = cache(async (portal: Portal): Promise<Viewer | null> => {
  const session = await authFor(portal).api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & {
    username?: string | null;
    role?: string | null;
    timezone?: string | null;
    programs?: string[] | null;
  };
  const roles = parseRoles(user.role);
  if (portalForRoles(roles) !== portal) return null;
  return {
    id: user.id,
    name: user.name || user.username || "Member",
    username: user.username ?? "",
    email: user.email,
    image: user.image ?? null,
    roles,
    permissions: permissionsFor(roles),
    roleLabel: primaryRoleLabel(roles),
    staff: isStaff(roles),
    timezone: user.timezone || "America/New_York",
    programs: user.programs ?? ["lp"],
    impersonatedBy: (session.session as { impersonatedBy?: string | null }).impersonatedBy ?? null,
  };
});

/** The person signed in to this request's portal. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const portal = await getRequestPortal();
  if (portal) return getViewerIn(portal);
  return (await getViewerIn("member")) ?? getViewerIn("staff");
});

/** The Better Auth instance for this request's session (sessions list, cookie refresh). */
export async function getRequestAuth() {
  const portal = await getRequestPortal();
  if (portal) return authFor(portal);
  const viewer = await getViewer();
  return authFor(viewer ? portalForRoles(viewer.roles) : "member");
}

/** For pages: sends anonymous visitors to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** For pages: sends the viewer back to their home page when they lack the permission. */
export async function requirePermission(permission: Permission): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!hasPermission(viewer.roles, permission)) redirect(`${homePathFor(viewer.roles)}?denied=1`);
  return viewer;
}

export function can(viewer: Pick<Viewer, "roles">, permission: Permission) {
  return hasPermission(viewer.roles, permission);
}

export class AuthError extends Error {
  constructor(message = "You don't have access to that.") {
    super(message);
    this.name = "AuthError";
  }
}

/** For actions and route handlers: throws instead of redirecting. */
export async function assertPermission(permission: Permission): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError("Please sign in again.");
  if (!hasPermission(viewer.roles, permission)) throw new AuthError();
  return viewer;
}
