import "server-only";
import { eq, sql, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { parseRoles, type Role } from "@/server/auth/roles";
import { AuthError, can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { profiles, users } from "@/server/db/schema";

/**
 * Who may see which Peer Navigation participant.
 *
 * - A coach sees only participants whose `profile.coachId` is them (the old
 *   site checked nothing: any coach could open anyone by URL).
 * - Coordinators and admins (`peernav.allParticipants`) see every Peer
 *   Navigation participant — participants only, not every user.
 * - A participant sees their own file space and messages.
 */

export const PN_PARTICIPANT_ROLE: Role = "ecoach_user";
export const PN_COACH_ROLE: Role = "coach";

/** SQL condition on the Better Auth `role` string ("participant,ecoach_user"): `role` is one of the entries. */
export function roleFilter(role: Role): SQL {
  return sql`coalesce(${users.role}, '') ~ ${`(^|,)\\s*${role}\\s*(,|$)`}`;
}

export function isPnParticipant(roleString: string | null | undefined) {
  return parseRoles(roleString).includes(PN_PARTICIPANT_ROLE);
}

export type StaffParticipantAccess = {
  participantId: string;
  /** The viewer is this participant's assigned coach (can message them). */
  isAssignedCoach: boolean;
  coachId: string | null;
};

async function resolveStaffAccess(viewer: Viewer, participantId: string): Promise<StaffParticipantAccess | null> {
  if (!can(viewer, "peernav.coach") || !isUuid(participantId)) return null;
  const [user] = await db
    .select({ role: users.role, coachId: profiles.coachId })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, participantId))
    .limit(1);
  if (!user || !isPnParticipant(user.role)) return null;
  const coachId = user.coachId ?? null;
  const isAssignedCoach = coachId === viewer.id;
  if (!isAssignedCoach && !can(viewer, "peernav.allParticipants")) return null;
  return { participantId, isAssignedCoach, coachId };
}

/** For staff pages: 404 unless the viewer may work with this participant. */
export async function requireParticipantAccess(viewer: Viewer, participantId: string) {
  const access = await resolveStaffAccess(viewer, participantId);
  if (!access) notFound();
  return access;
}

/** For actions and route handlers. */
export async function assertParticipantAccess(viewer: Viewer, participantId: string) {
  const access = await resolveStaffAccess(viewer, participantId);
  if (!access) throw new AuthError("You don't have access to this participant.");
  return access;
}

/**
 * Files: the participant themself, their coach, and coordinators/admins.
 * Returns the viewer's relationship to the space, or null.
 */
export async function fileSpaceAccess(viewer: Viewer, participantId: string) {
  if (!isUuid(participantId)) return null;
  if (viewer.id === participantId && can(viewer, "peernav.participant")) return { self: true as const };
  const staff = await resolveStaffAccess(viewer, participantId);
  return staff ? { self: false as const, ...staff } : null;
}

/** The participant's assigned coach id (or null). */
export async function coachIdOf(participantId: string) {
  if (!isUuid(participantId)) return null;
  const [profile] = await db.select({ coachId: profiles.coachId }).from(profiles).where(eq(profiles.userId, participantId)).limit(1);
  return profile?.coachId ?? null;
}
