"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { award } from "@/features/gamification/points";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { can } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { tipFavorites, tipViews } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";
import { releasedTipFor } from "./queries";

const tipIdSchema = uuidSchema;

/** Heart / un-heart a tip. Returns the new state for optimistic UI. */
export const toggleFavoriteTip = permissionAction("tips.view")
  .inputSchema(z.object({ tipId: tipIdSchema, favorite: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const found = await releasedTipFor(ctx.viewer, parsedInput.tipId);
    if (!found) throw new UserFacingError("That tip isn't available any more.");
    if (parsedInput.favorite) {
      if (!found.released) throw new UserFacingError("That tip isn't available yet.");
      await db
        .insert(tipFavorites)
        .values({ userId: ctx.viewer.id, tipId: parsedInput.tipId })
        .onConflictDoNothing({ target: [tipFavorites.userId, tipFavorites.tipId] });
    } else {
      await db
        .delete(tipFavorites)
        .where(and(eq(tipFavorites.userId, ctx.viewer.id), eq(tipFavorites.tipId, parsedInput.tipId)));
    }
    return { favorite: parsedInput.favorite };
  });

/**
 * A participant looked at a tip (carousel slide in view for a moment, or the
 * tip page). Counts the view for reports and awards points once per tip:
 * 5 when it is recommended to them, else 2. Replaces GET /tip-points/{nid}/{flag},
 * which trusted the client's "highlighted" flag.
 */
export const recordTipView = permissionAction("tips.view")
  .inputSchema(z.object({ tipId: tipIdSchema }))
  .action(async ({ parsedInput, ctx }) => {
    if (!can(ctx.viewer, "tips.earnPoints")) return { points: 0 };
    const found = await releasedTipFor(ctx.viewer, parsedInput.tipId);
    if (!found || !found.released) return { points: 0 };

    const now = new Date();
    await db
      .insert(tipViews)
      .values({
        userId: ctx.viewer.id,
        tipId: found.tip.id,
        count: 1,
        recommended: found.recommended,
        firstViewedAt: now,
        lastViewedAt: now,
      })
      .onConflictDoUpdate({
        target: [tipViews.userId, tipViews.tipId],
        set: { count: sql`${tipViews.count} + 1`, lastViewedAt: now },
      });
    const result = await award({
      userId: ctx.viewer.id,
      reason: found.recommended ? "tip_view_recommended" : "tip_view",
      key: `tip-view:${parsedInput.tipId}`,
    });
    await trackUsage(ctx.viewer.id, "tip_open", { tipId: parsedInput.tipId });
    return { points: result.awarded ? result.points : 0, recommended: found.recommended };
  });
