"use server";

import { and, eq, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { authedAction } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { notifications } from "@/server/db/schema";
import { listNotifications } from "./queries";

/** Hides one notification ("Delete" on the old cards). Only your own. */
export const dismissNotification = authedAction
  .inputSchema(z.object({ id: uuidSchema }))
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    await db
      .update(notifications)
      .set({ dismissedAt: new Date() })
      .where(and(eq(notifications.id, parsedInput.id), eq(notifications.userId, viewer.id)));
    return { ok: true };
  });

/** Undo for a dismiss. */
export const restoreNotification = authedAction
  .inputSchema(z.object({ id: uuidSchema }))
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    await db
      .update(notifications)
      .set({ dismissedAt: null })
      .where(and(eq(notifications.id, parsedInput.id), eq(notifications.userId, viewer.id)));
    return { ok: true };
  });

/** Clears the whole list. */
export const dismissAllNotifications = authedAction.action(async ({ ctx: { viewer } }) => {
  const now = new Date();
  const rows = await db
    .update(notifications)
    .set({ dismissedAt: now })
    .where(and(eq(notifications.userId, viewer.id), isNull(notifications.dismissedAt), lte(notifications.createdAt, now)))
    .returning({ id: notifications.id });
  return { count: rows.length };
});

export const loadMoreNotifications = authedAction
  .inputSchema(z.object({ cursor: z.string().max(80), seen: z.string().max(40).nullable() }))
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    const seen = parsedInput.seen ? new Date(parsedInput.seen) : null;
    return listNotifications(viewer, {
      cursor: parsedInput.cursor,
      seen: seen && !Number.isNaN(seen.getTime()) ? seen : null,
    });
  });
