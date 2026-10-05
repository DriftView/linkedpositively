import "server-only";
import { and, gte, inArray, lt, ne, or } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";
import { loginSessions, pointEntries, profiles, sessions, usageEvents, users } from "@/server/db/schema";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { awardMomentFor, previousLocalDay } from "./day-window";
import { isActiveParticipant } from "./participants";
import { award } from "./points";

/**
 * Of `userIds`, those who used the app in [start, end): signed in, had a
 * session refreshed, recorded a usage event, earned other points or were
 * marked active. Replaces the legacy check on `users.access` (P9).
 */
export async function activeUserIds(userIds: string[], start: Date, end: Date) {
  if (!userIds.length) return new Set<string>();
  const rows = await union(
    db
      .select({ userId: loginSessions.userId })
      .from(loginSessions)
      .where(and(inArray(loginSessions.userId, userIds), gte(loginSessions.loginAt, start), lt(loginSessions.loginAt, end))),
    db
      .select({ userId: usageEvents.userId })
      .from(usageEvents)
      .where(and(inArray(usageEvents.userId, userIds), gte(usageEvents.at, start), lt(usageEvents.at, end))),
    db
      .select({ userId: pointEntries.userId })
      .from(pointEntries)
      .where(
        and(
          inArray(pointEntries.userId, userIds),
          gte(pointEntries.at, start),
          lt(pointEntries.at, end),
          ne(pointEntries.reason, "time_on_site"),
        ),
      ),
    db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(and(inArray(profiles.userId, userIds), gte(profiles.lastActiveAt, start), lt(profiles.lastActiveAt, end))),
    db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(
        and(
          inArray(sessions.userId, userIds),
          or(
            and(gte(sessions.createdAt, start), lt(sessions.createdAt, end)),
            and(gte(sessions.updatedAt, start), lt(sessions.updatedAt, end)),
          ),
        ),
      ),
  );
  return new Set(rows.map((row) => row.userId));
}

/**
 * Daily time-on-site points (legacy P9: 2 points for every participant who
 * used the site that day). Credits each participant for their previous
 * local calendar day, once: the idempotency key makes re-runs and retries
 * safe, and an hourly schedule picks every timezone up soon after its
 * midnight.
 */
export async function awardTimeOnSite(now = new Date()) {
  const participants = await db.select({ id: users.id, timezone: users.timezone }).from(users).where(isActiveParticipant);

  const byZone = new Map<string, string[]>();
  for (const user of participants) {
    const zone = user.timezone || DEFAULT_TIMEZONE;
    byZone.set(zone, [...(byZone.get(zone) ?? []), user.id]);
  }

  let awarded = 0;
  for (const [zone, ids] of byZone) {
    let window;
    try {
      window = previousLocalDay(now, zone);
    } catch {
      window = previousLocalDay(now, DEFAULT_TIMEZONE);
    }
    const active = await activeUserIds(ids, window.start, window.end);
    for (const userId of active) {
      const result = await award({
        userId,
        reason: "time_on_site",
        key: `time-on-site:${window.key}`,
        at: awardMomentFor(window),
      });
      if (result.awarded) awarded += 1;
    }
  }
  return { participants: participants.length, awarded };
}
