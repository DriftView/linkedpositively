import "server-only";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { smsClicks, users } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";

/** Parses the legacy `?sms=<uid>:<week>` value. */
export function parseLegacySms(value: string) {
  // "19+4" is the extra mid-week message; its "+" often arrives decoded as a space.
  const match = /^(\d{1,9}):(\d{1,2})([+ ]4)?$/.exec(value.trim());
  if (!match) return null;
  return { uid: Number(match[1]), week: Number(match[2]), extra: Boolean(match[3]) };
}

/**
 * Records a click on an old (pre-rewrite) program link, but only when the
 * visitor is signed in as the migrated account that link was sent to.
 */
export async function recordLegacyClick(value: string, headers: Headers) {
  const parsed = parseLegacySms(value);
  if (!parsed) return false;
  const session = await auth.api.getSession({ headers });
  if (!session) return false;
  const [user] = await db
    .select({ id: users.id, legacySite: users.legacySite, legacyId: users.legacyId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user || user.legacySite !== "lp" || user.legacyId !== parsed.uid) return false;
  const flag = parsed.extra ? `WEEK-${parsed.week}+4` : `WEEK-${parsed.week}`;
  const now = new Date();
  await db
    .insert(smsClicks)
    .values({ userId: user.id, flag, week: parsed.week, cycle: "legacy", firstClickAt: now, lastClickAt: now })
    .onConflictDoUpdate({
      target: [smsClicks.userId, smsClicks.flag, smsClicks.cycle],
      set: { lastClickAt: now, count: sql`${smsClicks.count} + 1` },
    });
  await trackUsage(session.user.id, "sms_click", { week: parsed.week, flag, legacy: true });
  return true;
}
