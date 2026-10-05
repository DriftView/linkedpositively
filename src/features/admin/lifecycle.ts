import "server-only";
import { differenceInCalendarDays } from "date-fns";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { inZone } from "@/lib/dates";
import { db } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";
import { blockUsers } from "./accounts";
import { hasRole } from "./role-sql";
import { getSettings } from "./settings";

/** True when more than `days` calendar days have passed since the start date (legacy: `> 150`). */
export function isPastStudyPeriod(start: Date, now: Date, timezone: string, days: number) {
  return differenceInCalendarDays(inZone(now, timezone), inZone(start, timezone)) > days;
}

/**
 * Legacy twm_general_cron: deactivates active participants whose
 * intervention started more than 150 days ago. People without a start date
 * are left alone. The old job ran hourly because of a broken guard; this one
 * runs daily and is idempotent.
 */
export async function autoBlockExpiredParticipants(now = new Date()) {
  const settings = await getSettings();
  if (!settings.autoBlockEnabled) return { blocked: 0, disabled: true };
  const rows = await db
    .select({ userId: users.id, timezone: users.timezone, start: profiles.interventionStartDate })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        hasRole(users.role, "participant"),
        sql`${users.banned} is not true`,
        isNotNull(profiles.interventionStartDate),
      ),
    );
  const expired = rows
    .filter((row) => isPastStudyPeriod(row.start!, now, row.timezone || "America/New_York", settings.autoBlockDays))
    .map((row) => row.userId);
  if (!expired.length) return { blocked: 0, disabled: false };
  const blocked = await blockUsers(null, expired, `Study period ended (${settings.autoBlockDays} days)`);
  return { blocked, disabled: false };
}
