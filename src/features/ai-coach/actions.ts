"use server";

import { and, eq, isNull } from "drizzle-orm";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { aiConversations, aiMessages, aiPreferences } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";
import { clientEventSchema, conversationIdSchema, feedbackSchema, preferencesSchema } from "./schemas";

/**
 * "Clear" hides a conversation from the member. It is kept for the study
 * (conversations are never deleted; see docs/AI_COACH.md "Retention").
 */
export const hideConversationAction = permissionAction("ai.chat")
  .inputSchema(conversationIdSchema)
  .action(async ({ parsedInput: { conversationId }, ctx: { viewer } }) => {
    const updated = await db
      .update(aiConversations)
      .set({ hiddenAt: new Date() })
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, viewer.id), isNull(aiConversations.hiddenAt)))
      .returning({ id: aiConversations.id });
    if (!updated.length) throw new UserFacingError("That conversation isn't available.");
    return { ok: true };
  });

export const feedbackAction = permissionAction("ai.chat")
  .inputSchema(feedbackSchema)
  .action(async ({ parsedInput: { messageId, value }, ctx: { viewer } }) => {
    const updated = await db
      .update(aiMessages)
      .set({ feedback: value })
      .where(and(eq(aiMessages.id, messageId), eq(aiMessages.userId, viewer.id), eq(aiMessages.role, "assistant")))
      .returning({ id: aiMessages.id });
    if (!updated.length) throw new UserFacingError("That reply isn't available.");
    if (value) await trackUsage(viewer.id, "ai_feedback", { helpful: value === 1 });
    return { ok: true };
  });

export const savePreferencesAction = permissionAction("ai.chat")
  .inputSchema(preferencesSchema)
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    await db
      .insert(aiPreferences)
      .values({ userId: viewer.id, ...parsedInput })
      .onConflictDoUpdate({ target: aiPreferences.userId, set: { ...parsedInput, updatedAt: new Date() } });
    return { ok: true };
  });

/** Usage events that happen in the browser (ids and counts only). */
export const recordClientEventAction = permissionAction("ai.chat")
  .inputSchema(clientEventSchema)
  .action(async ({ parsedInput: { event }, ctx: { viewer } }) => {
    await trackUsage(viewer.id, event === "handoff_sent" ? "ai_handoff_sent" : "ai_voice_output");
    return { ok: true };
  });
