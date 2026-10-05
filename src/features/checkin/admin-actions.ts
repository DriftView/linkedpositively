"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { permissionAction } from "@/server/actions/safe-action";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { checkinPrompts } from "@/server/db/schema";
import { sanitizeStaffHtml } from "@/server/services/sanitize";
import { promptInputSchema } from "./schemas";

/** Staff actions for weekly check-in prompts (/admin/content/check-in). */
const manage = permissionAction("content.manage");

export const savePrompt = manage.inputSchema(promptInputSchema).action(async ({ parsedInput: input, ctx }) => {
  const options = [...input.likertOptions].sort((a, b) => a.value - b.value);
  const set = {
    title: input.title,
    likertText: input.likertText,
    likertOptions: options,
    openText: input.openText,
    openPlaceholder: input.openPlaceholder,
    feedbackLow: sanitizeStaffHtml(input.feedbackLow),
    feedbackMedium: sanitizeStaffHtml(input.feedbackMedium),
    feedbackHigh: sanitizeStaffHtml(input.feedbackHigh),
    moreAdherentFeedback: input.moreAdherentFeedback,
    lessAdherentFeedback: input.lessAdherentFeedback,
    updatedBy: ctx.viewer.id,
  };
  await db
    .insert(checkinPrompts)
    .values({ sequence: input.sequence, ...set })
    .onConflictDoUpdate({ target: checkinPrompts.sequence, set });
  revalidatePath("/admin/content/check-in", "layout");
  return { sequence: input.sequence };
});

export const deletePrompt = manage
  .inputSchema(z.object({ sequence: z.number().int().min(1).max(10) }))
  .action(async ({ parsedInput }) => {
    await db.delete(checkinPrompts).where(eq(checkinPrompts.sequence, parsedInput.sequence));
    revalidatePath("/admin/content/check-in", "layout");
    return { ok: true };
  });
