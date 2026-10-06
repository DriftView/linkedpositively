import "server-only";
import { after } from "next/server";
import { cache } from "react";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { openAlertCount } from "@/features/ai-coach/escalation";
import { wallNewCount } from "@/features/community/counts";
import { unreadMessagesCount } from "@/features/peer-nav/counts";
import { tipsNewCount } from "@/features/tips/counts";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { profiles } from "@/server/db/schema";
import { unreadNotificationsCount } from "./unread";

/**
 * Badge counts shown in the shells (bell, "N New" on Home and Tips, unread
 * messages). Each feature owns its own counter.
 */
export const getShellCounts = cache(async (viewer: Viewer) => {
  after(() => touchLastActive(viewer.id));
  const [notifications, wallNew, tipsNew, unreadMessages, aiAlerts] = await Promise.all([
    unreadNotificationsCount(viewer),
    can(viewer, "community.post") ? wallNewCount(viewer) : 0,
    can(viewer, "tips.view") ? tipsNewCount(viewer) : 0,
    can(viewer, "peernav.messages") ? unreadMessagesCount(viewer) : 0,
    can(viewer, "ai.review") ? openAlertCount() : 0,
  ]);
  return { notifications, wallNew, tipsNew, unreadMessages, aiAlerts };
});

/** Marks the viewer active (at most every 10 minutes); feeds time-on-site points and reports. */
async function touchLastActive(userId: string) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  await db
    .update(profiles)
    .set({ lastActiveAt: new Date() })
    .where(and(eq(profiles.userId, userId), or(lt(profiles.lastActiveAt, cutoff), isNull(profiles.lastActiveAt))))
    .catch(() => undefined);
}
