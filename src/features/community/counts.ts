import "server-only";
import { cache } from "react";
import { and, count, eq, gt, isNull, lte, ne, or } from "drizzle-orm";
import type { Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { posts, profiles } from "@/server/db/schema";

/** Without a previous visit, only the last two weeks count as "new". */
const FIRST_VISIT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** When the viewer last opened the wall (per user; the old site kept one global value). */
export const lastWallVisit = cache(async (userId: string) => {
  const [profile] = await db
    .select({ lastWallVisitAt: profiles.lastWallVisitAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile?.lastWallVisitAt ?? null;
});

/** "Your Wall | N New": posts by others since the viewer's last wall visit. */
export async function wallNewCount(viewer: Viewer) {
  const since = (await lastWallVisit(viewer.id)) ?? new Date(Date.now() - FIRST_VISIT_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(posts)
    .where(
      and(
        gt(posts.createdAt, since),
        lte(posts.createdAt, new Date()),
        // Posts by deleted accounts (no author) are by someone else too.
        or(isNull(posts.authorId), ne(posts.authorId, viewer.id)),
      ),
    );
  return row?.n ?? 0;
}

/** Marks the wall as seen now (called after the home page renders). */
export async function markWallVisited(userId: string) {
  const now = new Date();
  await db
    .insert(profiles)
    .values({ userId, lastWallVisitAt: now })
    .onConflictDoUpdate({ target: profiles.userId, set: { lastWallVisitAt: now } });
}
