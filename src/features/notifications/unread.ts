import "server-only";
import { cache } from "react";
import { and, count, eq, gt, isNull, lte, or, type SQL } from "drizzle-orm";
import type { Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { notifications, profiles } from "@/server/db/schema";

/** When the viewer last opened /notifications (per user; the old site kept one global value). */
export const lastNotificationsSeen = cache(async (userId: string) => {
  const [profile] = await db
    .select({ lastNotificationsSeenAt: profiles.lastNotificationsSeenAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile?.lastNotificationsSeenAt ?? null;
});

/** Condition for notifications the viewer can currently see. */
export function visibleFilter(userId: string, now = new Date()): SQL {
  return and(
    eq(notifications.userId, userId),
    isNull(notifications.dismissedAt),
    lte(notifications.createdAt, now),
    or(isNull(notifications.hiddenUntil), lte(notifications.hiddenUntil, now)),
  )!;
}

/** Bell count: notifications newer than the viewer's last visit to /notifications. */
export async function unreadNotificationsCount(viewer: Viewer) {
  const seen = await lastNotificationsSeen(viewer.id);
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(visibleFilter(viewer.id), seen ? gt(notifications.createdAt, seen) : undefined));
  return row?.n ?? 0;
}
