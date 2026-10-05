import "server-only";
import { desc, eq, type SQL } from "drizzle-orm";
import { hasRole } from "@/features/admin/role-sql";
import { db } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";
import { parseRoles, type Role } from "@/server/auth/roles";
import type { Arm, ReportFilters } from "./filters";

/** One person a report covers. Study data stays server-side until a report picks what it prints. */
export type Person = {
  id: string;
  /** Study ID, "" when none. */
  sid: string;
  username: string;
  name: string;
  roles: Role[];
  /** Drupal uid of migrated accounts (legacy "User Id" column). */
  legacyUid: number | null;
  createdAt: Date | null;
  banned: boolean;
  timezone: string;
  interventionStartDate: Date | null;
  avatarId: string | null;
  photoKey: string | null;
  lastActiveAt: Date | null;
};

export type Population = {
  people: Person[];
  byId: Map<string, Person>;
  /** User ids of `people`, for `inIds(column, population.ids)`. */
  ids: string[];
  /** People in the arm left out because they have no study ID. */
  missingSid: number;
};

/** `users.role` is a comma-separated list: true when one of `roles` is in it. */
function hasAnyRole(roles: Role[]): SQL {
  return hasRole(users.role, roles);
}

function armFilter(arm: Arm): SQL | undefined {
  if (arm === "participant") return hasAnyRole(["participant"]);
  if (arm === "control") return hasAnyRole(["control"]);
  if (arm === "study") return hasAnyRole(["participant", "control"]);
  return undefined;
}

/**
 * The people a report covers: users in the chosen study arm, optionally
 * narrowed by a study-ID search. The legacy research reports only listed
 * accounts with a study ID; `requireSid` keeps that rule and counts who was
 * left out so staff can fix missing IDs.
 */
export async function studyPopulation(filters: ReportFilters, { requireSid = true } = {}): Promise<Population> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      displayUsername: users.displayUsername,
      role: users.role,
      legacySite: users.legacySite,
      legacyId: users.legacyId,
      createdAt: users.createdAt,
      banned: users.banned,
      timezone: users.timezone,
      studyId: profiles.studyId,
      interventionStartDate: profiles.interventionStartDate,
      avatarId: profiles.avatarId,
      photoKey: profiles.photoKey,
      lastActiveAt: profiles.lastActiveAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(armFilter(filters.arm))
    .orderBy(desc(users.createdAt), desc(users.id));
  const needle = filters.sid?.toLowerCase();

  let missingSid = 0;
  const people: Person[] = [];
  for (const user of rows) {
    const sid = user.studyId?.trim() ?? "";
    if (!sid && requireSid) {
      missingSid += 1;
      continue;
    }
    if (needle && !sid.toLowerCase().includes(needle)) continue;
    people.push({
      id: user.id,
      sid,
      username: user.username ?? "",
      name: user.name || user.displayUsername || user.username || "",
      roles: parseRoles(user.role),
      legacyUid: user.legacySite === "lp" && user.legacyId !== null ? user.legacyId : null,
      createdAt: user.createdAt ?? null,
      banned: Boolean(user.banned),
      timezone: user.timezone || "America/New_York",
      interventionStartDate: user.interventionStartDate ?? null,
      avatarId: user.avatarId ?? null,
      photoKey: user.photoKey ?? null,
      lastActiveAt: user.lastActiveAt ?? null,
    });
  }
  return {
    people,
    byId: new Map(people.map((p) => [p.id, p])),
    ids: people.map((p) => p.id),
    missingSid: needle ? 0 : missingSid,
  };
}
