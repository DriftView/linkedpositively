import { isNotNull } from "drizzle-orm";
import { users } from "@/server/db/schema";
import type { Ctx } from "./context";

/**
 * Drupal uid → user uuid, built from `users.legacy` after the users step.
 * One person can have both an LP and a Peer Navigation uid (merged account):
 * `legacy = { site: "lp", id: <lp uid>, lpUid, pnUid }`.
 */
export type UserMap = {
  lp: Map<number, string>;
  pn: Map<number, string>;
  /** uuid → timezone (for local calendar days). */
  timezone: Map<string, string>;
};

let cached: UserMap | null = null;

export async function userMap(ctx: Ctx, refresh = false): Promise<UserMap> {
  if (cached && !refresh) return cached;
  const rows = await ctx.db
    .select({ id: users.id, legacy: users.legacy, timezone: users.timezone })
    .from(users)
    .where(isNotNull(users.legacy));
  const map: UserMap = { lp: new Map(), pn: new Map(), timezone: new Map() };
  for (const row of rows) {
    const legacy = row.legacy as Record<string, unknown> | null;
    if (!legacy) continue;
    const lpUid = Number(legacy.lpUid ?? (legacy.site === "lp" ? legacy.id : NaN));
    const pnUid = Number(legacy.pnUid ?? (legacy.site === "peernav" ? legacy.id : NaN));
    if (Number.isFinite(lpUid)) map.lp.set(lpUid, row.id);
    if (Number.isFinite(pnUid)) map.pn.set(pnUid, row.id);
    map.timezone.set(row.id, row.timezone || "America/New_York");
  }
  cached = map;
  return map;
}

/** Timezone used for a legacy LP uid's local days (site default America/Los_Angeles on LP). */
export function tzOf(map: UserMap, userId: string | undefined, fallback = "America/New_York") {
  return (userId && map.timezone.get(userId)) || fallback;
}
