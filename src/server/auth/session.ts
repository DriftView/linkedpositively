import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import {
  hasPermission,
  isStaff,
  parseRoles,
  permissionsFor,
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

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & {
    username?: string | null;
    role?: string | null;
    timezone?: string | null;
    programs?: string[] | null;
  };
  const roles = parseRoles(user.role);
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

/** For pages: sends anonymous visitors to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** For pages: 404s when the viewer lacks the permission (don't reveal what exists). */
export async function requirePermission(permission: Permission): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!hasPermission(viewer.roles, permission)) redirect("/?denied=1");
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
