"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { notify } from "@/features/notifications/notify";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { SUPPORT_STATUSES, SUPPORT_TOPICS, supportTickets } from "@/server/db/schema";

const submitSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS),
  body: z.string().trim().min(10, "Tell us a little more (at least a sentence).").max(5000),
  device: z.string().trim().max(300).optional(),
});

/** Any signed-in person can ask for help (old node/add/tech-support). */
export const submitSupportTicketAction = authedAction.inputSchema(submitSchema).action(async ({ parsedInput, ctx }) => {
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(supportTickets)
    .where(and(eq(supportTickets.userId, ctx.viewer.id), gt(supportTickets.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (recent >= 5) throw new UserFacingError("We've got your messages. Please give the team a little time to reply.");
  const [ticket] = await db
    .insert(supportTickets)
    .values({
      userId: ctx.viewer.id,
      topic: parsedInput.topic,
      body: parsedInput.body,
      device: parsedInput.device || null,
    })
    .returning();
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return {
    id: ticket.id,
    topic: ticket.topic,
    body: ticket.body,
    status: ticket.status,
    reply: "",
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
});

const updateSchema = z.object({
  id: uuidSchema,
  status: z.enum(SUPPORT_STATUSES),
  reply: z.string().trim().max(2000).default(""),
  staffNote: z.string().trim().max(5000).default(""),
});

/** Staff: move a request through the queue, reply to the member, keep notes. */
export const updateSupportTicketAction = permissionAction("support.manage")
  .inputSchema(updateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [before] = await db
      .select({ status: supportTickets.status, reply: supportTickets.reply, userId: supportTickets.userId })
      .from(supportTickets)
      .where(eq(supportTickets.id, parsedInput.id))
      .limit(1);
    if (!before) throw new UserFacingError("That request was deleted.");
    const [saved] = await db
      .update(supportTickets)
      .set({
        status: parsedInput.status,
        reply: parsedInput.reply,
        staffNote: parsedInput.staffNote,
        handledBy: ctx.viewer.id,
        ...(parsedInput.status === "resolved" && before.status !== "resolved" ? { resolvedAt: new Date() } : {}),
        ...(parsedInput.status !== "resolved" ? { resolvedAt: null } : {}),
      })
      .where(eq(supportTickets.id, parsedInput.id))
      .returning({ updatedAt: supportTickets.updatedAt });

    const replyChanged = parsedInput.reply && parsedInput.reply !== (before.reply ?? "");
    const resolvedNow = parsedInput.status === "resolved" && before.status !== "resolved";
    if (replyChanged || resolvedNow) {
      await notify({
        userId: before.userId,
        actorId: ctx.viewer.id,
        kind: "system",
        text: resolvedNow ? "Tech support marked your request as resolved." : "Tech support replied to your request.",
        excerpt: parsedInput.reply || undefined,
        href: "/support",
        dedupeKey: `support:${parsedInput.id}:${saved?.updatedAt?.getTime() ?? Date.now()}`,
      });
    }
    revalidatePath("/admin/support");
    revalidatePath("/support");
    return { id: parsedInput.id, status: parsedInput.status, updatedAt: saved?.updatedAt?.toISOString() ?? new Date().toISOString() };
  });
