import "server-only";
import { eq, isNotNull, sql } from "drizzle-orm";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { db, type Executor } from "@/server/db/client";
import { levelCopy, pointEntries, users } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { notify } from "@/features/notifications/notify";
import { DEFAULT_LEVEL_COPY, levelForPoints } from "./levels";

/**
 * Point rules (docs/legacy/04 §2.2). Values are unchanged from the old site;
 * abuse-prone rules now carry idempotency keys or daily caps instead of being
 * unlimited.
 */
export const POINT_RULES = {
  comment_received: 10, // someone else commented on your content
  comment_on_tip: 2,
  comment_on_post: 10,
  comment_on_resource: 5,
  post: 10,
  reaction_given: 1,
  reaction_earned: 1,
  tip_view: 2,
  tip_view_recommended: 5,
  community_guidelines: 25,
  resource_rating: 5,
  time_on_site: 2,
  resource_view: 1,
  tracker_create: 25,
  tracker_settings: 25,
  tracker_checkin: 2,
  profile_complete: 50,
  weekly_checkin: 10,
} as const;
export type PointReason = keyof typeof POINT_RULES;

/** Sum of the points sql expression, as a JS number (0 when there are no rows). */
export const sumPoints = sql<number>`coalesce(sum(${pointEntries.points}), 0)::int`;

export async function totalPoints(userId: string, executor: Executor = db) {
  const [row] = await executor.select({ total: sumPoints }).from(pointEntries).where(eq(pointEntries.userId, userId));
  return row?.total ?? 0;
}

/**
 * Awards points for `reason` unless the same `key` was already awarded.
 * Only users who can earn points (participants) get them. Sends a level-up
 * notification when the award crosses a level threshold.
 * Never throws: points must not break the action that earned them.
 */
export async function award(input: {
  userId: string;
  reason: PointReason;
  key?: string;
  points?: number;
  /** When the points were earned (defaults to now), e.g. the day a daily job credits. */
  at?: Date;
}) {
  try {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user || !hasPermission(parseRoles(user.role), "gamification.earn")) return { awarded: false as const };

    const before = await totalPoints(input.userId);
    const points = input.points ?? POINT_RULES[input.reason];
    const inserted = await db
      .insert(pointEntries)
      .values({ userId: input.userId, reason: input.reason, points, key: input.key, at: input.at ?? new Date() })
      .onConflictDoNothing({ target: [pointEntries.userId, pointEntries.key], where: isNotNull(pointEntries.key) })
      .returning({ id: pointEntries.id });
    if (!inserted.length) return { awarded: false as const };

    const after = before + points;
    const previous = levelForPoints(before);
    const current = levelForPoints(after);
    if (current.level > previous.level) {
      const [copy] = await db
        .select({ headline: levelCopy.headline })
        .from(levelCopy)
        .where(eq(levelCopy.level, current.level))
        .limit(1)
        .catch(() => []);
      const headline = copy?.headline || DEFAULT_LEVEL_COPY[current.level]?.headline || current.headline;
      await notify({
        userId: input.userId,
        kind: "level",
        text: `Congratulations, you've leveled up to Level ${current.level}! ${headline}`,
        href: "/levels",
        dedupeKey: `level-${current.level}`,
      });
    }
    return { awarded: true as const, points, total: after, level: current.level };
  } catch (error) {
    logger.error({ userId: input.userId, reason: input.reason, err: (error as Error).message }, "award failed");
    return { awarded: false as const };
  }
}

/**
 * Points for reading the community guidelines (legacy P7, 25 points, once
 * per user). Called by the pages feature when the guidelines page is viewed.
 * Never throws.
 */
export function awardGuidelinesRead(userId: string) {
  return award({ userId, reason: "community_guidelines", key: "community-guidelines" });
}
