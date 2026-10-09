"use server";

import { and, eq, isNull } from "drizzle-orm";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { aiConversations, aiMessages, aiPreferences } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";
import {
  clientEventSchema,
  coachDesignSchema,
  conversationIdSchema,
  feedbackSchema,
  preferencesSchema,
} from "./schemas";

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
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.userId, viewer.id),
          isNull(aiConversations.hiddenAt),
        ),
      )
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

/**
 * Saves the member's coach design. The study sees which options were picked
 * (usage event); the coach's name is free text, so it is never logged.
 */
export const saveCoachDesignAction = permissionAction("ai.chat")
  .inputSchema(coachDesignSchema)
  .action(async ({ parsedInput: design, ctx: { viewer } }) => {
    const values = {
      look: design.look,
      coachName: design.name,
      coachPronouns: design.pronouns,
      appearance: design.appearance,
      voice: design.voice,
      tone: design.tone,
      replyLength: design.replyLength,
    };
    await db
      .insert(aiPreferences)
      .values({ userId: viewer.id, ...values })
      .onConflictDoUpdate({ target: aiPreferences.userId, set: { ...values, updatedAt: new Date() } });
    await trackUsage(viewer.id, "ai_coach_designed", {
      look: design.look,
      named: Boolean(design.name),
      customLook: Boolean(design.appearance),
      voice: design.voice ?? "preset",
      tone: design.tone,
      replyLength: design.replyLength,
    });
    return { ok: true };
  });

/** Usage events that happen in the browser (ids and counts only). */
export const recordClientEventAction = permissionAction("ai.chat")
  .inputSchema(clientEventSchema)
  .action(async ({ parsedInput: { event }, ctx: { viewer } }) => {
    await trackUsage(viewer.id, event === "handoff_sent" ? "ai_handoff_sent" : "ai_voice_output");
    return { ok: true };
  });
