import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { loginSessions, users } from "@/server/db/schema";
import { logger } from "@/server/logger";

/** Records a sign-in for the usage reports. Never blocks the sign-in itself. */
export async function onSignIn(userId: string, userAgent: string) {
  try {
    const [user] = await db.select({ programs: users.programs }).from(users).where(eq(users.id, userId)).limit(1);
    const program = user?.programs?.includes("lp") ? "lp" : "peernav";
    await db.insert(loginSessions).values({ userId, userAgent: userAgent.slice(0, 500), program });
  } catch (error) {
    logger.error({ userId, err: error instanceof Error ? error.message : error }, "login event failed");
  }
}

/** Closes the user's most recent open login session. */
export async function onSignOut(userId: string) {
  try {
    const latestOpen = db
      .select({ id: loginSessions.id })
      .from(loginSessions)
      .where(and(eq(loginSessions.userId, userId), isNull(loginSessions.logoutAt)))
      .orderBy(desc(loginSessions.loginAt))
      .limit(1);
    await db.update(loginSessions).set({ logoutAt: new Date() }).where(eq(loginSessions.id, latestOpen));
  } catch (error) {
    logger.error({ userId, err: error instanceof Error ? error.message : error }, "logout event failed");
  }
}
