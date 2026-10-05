"use server";

import { and, count, eq, gt, like } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { actionClient } from "@/server/actions/safe-action";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { users, verifications } from "@/server/db/schema";

/** At most this many reset emails per account per window (stops email bombing). */
const RESETS_PER_WINDOW = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

/** Reset links recently issued for the user (Better Auth stores one verification row per link). */
async function recentResetCount(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(verifications)
    .where(
      and(
        eq(verifications.value, userId),
        like(verifications.identifier, "reset-password:%"),
        gt(verifications.createdAt, new Date(Date.now() - RESET_WINDOW_MS)),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Starts a password reset from a username or an email (the old site accepted
 * either). The response never reveals whether the account exists.
 * Server-side auth.api calls skip Better Auth's HTTP rate limit, so repeated
 * requests for one account are capped here.
 */
export const requestPasswordReset = actionClient
  .inputSchema(z.object({ identifier: z.string().trim().min(1).max(254) }))
  .action(async ({ parsedInput: { identifier } }) => {
    const value = identifier.toLowerCase();
    const [user] = await db
      .select({ id: users.id, email: users.email, banned: users.banned })
      .from(users)
      .where(identifier.includes("@") ? eq(users.email, value) : eq(users.username, value))
      .limit(1);

    if (user?.email && !user.banned && (await recentResetCount(user.id)) < RESETS_PER_WINDOW) {
      await auth.api.requestPasswordReset({
        body: { email: user.email, redirectTo: `${env.NEXT_PUBLIC_APP_URL}/reset-password` },
      });
    }
    return { ok: true };
  });
