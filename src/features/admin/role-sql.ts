import "server-only";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Role } from "@/server/auth/roles";

/**
 * `users.role` is a comma-separated list (auth/roles.ts serializeRoles), possibly
 * with spaces ("participant, ecoach_user"). True when any of `roles` is one of the entries.
 */
export function hasRole(column: AnyColumn, role: Role | Role[]): SQL {
  const wanted = Array.isArray(role) ? role : [role];
  return sql`string_to_array(replace(coalesce(${column}, ''), ' ', ''), ',') && ${sql.param(wanted)}::text[]`;
}
