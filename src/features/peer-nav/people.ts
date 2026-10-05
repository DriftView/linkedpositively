import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { users } from "@/server/db/schema";
import type { PersonRef } from "./types";

type Id = string | null | undefined;

/** Loads name/username for a set of user ids. */
export async function peopleById(ids: Id[]) {
  const unique = [...new Set(ids.filter(isUuid))];
  const map = new Map<string, PersonRef>();
  if (!unique.length) return map;
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username, displayUsername: users.displayUsername })
    .from(users)
    .where(inArray(users.id, unique));
  for (const user of rows) map.set(user.id, toPerson(user));
  return map;
}

export function toPerson(user: { id: string; name?: string | null; username?: string | null; displayUsername?: string | null }): PersonRef {
  const username = user.displayUsername || user.username || "";
  return { id: user.id, name: user.name || username || "Member", username };
}

/** Columns `toPerson` needs, for `db.select({ ...personColumns, … })`. */
export const personColumns = { id: users.id, name: users.name, username: users.username, displayUsername: users.displayUsername };

export function iso(date: Date | null | undefined) {
  return date ? new Date(date).toISOString() : null;
}
