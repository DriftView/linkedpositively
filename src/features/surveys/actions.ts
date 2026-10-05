"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/features/admin/audit";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { SURVEY_FIELD_TARGETS, SURVEY_KEYS, surveys, users } from "@/server/db/schema";
import { qualtricsConfigured, syncQualtrics } from "./qualtrics";
import { markSurveyComplete, snoozePrompt } from "./service";

const surveySchema = z
  .object({
    key: z.enum(SURVEY_KEYS),
    title: z.string().trim().min(1, "Give the survey a name.").max(120),
    url: z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Enter the survey's https:// link." }).max(500)]),
    qualtricsSurveyId: z.union([z.literal(""), z.string().trim().regex(/^SV_[A-Za-z0-9]{6,40}$/, "Survey IDs look like SV_3Q1u2PtKqjJnsB7.")]),
    syncMode: z.enum(["off", "create_users", "update_users"]),
    promptEnabled: z.boolean(),
    openWeek: z.number().int().min(1).max(52),
    closeWeek: z.number().int().min(1).max(52),
    fieldMap: z
      .array(z.object({ source: z.string().trim().min(1).max(60), target: z.enum(SURVEY_FIELD_TARGETS) }))
      .max(200),
  })
  .refine((value) => value.closeWeek >= value.openWeek, { message: "The last week can't be before the first week.", path: ["closeWeek"] })
  .refine((value) => !value.promptEnabled || value.url, { message: "Add the survey link to show it to participants.", path: ["url"] })
  .refine((value) => value.syncMode === "off" || value.qualtricsSurveyId, { message: "Add the Qualtrics survey ID to import responses.", path: ["qualtricsSurveyId"] })
  .refine((value) => value.syncMode === "off" || value.fieldMap.some((entry) => entry.target === "studyId"), {
    message: "Map one question to the study ID.",
    path: ["fieldMap"],
  });

export const saveSurveyAction = permissionAction("surveys.manage")
  .inputSchema(surveySchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const fields = { ...input, updatedBy: ctx.viewer.id, updatedAt: new Date() };
    await db.insert(surveys).values(fields).onConflictDoUpdate({ target: surveys.key, set: fields });
    await audit({ actor: ctx.viewer, action: "survey.config", summary: `Updated the ${input.title} settings` });
    revalidatePath("/admin/surveys");
    revalidatePath("/admin/settings");
    return { ok: true };
  });

export const runSyncAction = permissionAction("surveys.manage").action(async ({ ctx }) => {
  if (!qualtricsConfigured()) throw new UserFacingError("Qualtrics isn't connected yet. Add the API token and data center to the server settings.");
  const summaries = await syncQualtrics();
  await audit({
    actor: ctx.viewer,
    action: "survey.sync",
    summary: `Ran the Qualtrics import: ${summaries.map((s) => `${s.survey} +${s.created} created, ${s.updated} updated, ${s.skipped} skipped`).join("; ") || "nothing to import"}`,
  });
  revalidatePath("/admin/surveys");
  return { summaries };
});

export const markCompleteForUserAction = permissionAction("users.edit")
  .inputSchema(z.object({ userId: uuidSchema, key: z.enum(SURVEY_KEYS) }))
  .action(async ({ parsedInput, ctx }) => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedInput.userId)).limit(1);
    if (!user) throw new UserFacingError("That account no longer exists.");
    const created = await markSurveyComplete(parsedInput.userId, parsedInput.key, "staff");
    if (created) {
      await audit({ actor: ctx.viewer, action: "survey.complete", targetIds: [parsedInput.userId], summary: `Marked the ${parsedInput.key} survey as done` });
    }
    revalidatePath(`/admin/users/${parsedInput.userId}`);
    revalidatePath("/admin/surveys");
    return { created };
  });

/** Participant: "Remind me later" on the survey pop-up. */
export const snoozeSurveyAction = authedAction
  .inputSchema(z.object({ key: z.enum(SURVEY_KEYS) }))
  .action(async ({ parsedInput, ctx }) => {
    await snoozePrompt({ id: ctx.viewer.id, name: ctx.viewer.name, timezone: ctx.viewer.timezone }, parsedInput.key);
    return { ok: true };
  });

/** Participant: "I've finished it". */
export const completeSurveyAction = authedAction
  .inputSchema(z.object({ key: z.enum(SURVEY_KEYS) }))
  .action(async ({ parsedInput, ctx }) => {
    await markSurveyComplete(ctx.viewer.id, parsedInput.key, "participant");
    revalidatePath("/surveys");
    return { ok: true };
  });

/** The midpoint survey link (legacy variable `midpoint_url`), editable from Settings too. */
export const saveMidpointUrlAction = permissionAction("surveys.manage")
  .inputSchema(z.object({ url: z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Enter the survey's https:// link." }).max(500)]) }))
  .action(async ({ parsedInput, ctx }) => {
    const fields = { url: parsedInput.url, updatedBy: ctx.viewer.id, updatedAt: new Date() };
    await db
      .insert(surveys)
      .values({ key: "midpoint", title: "Midpoint survey", ...fields })
      .onConflictDoUpdate({ target: surveys.key, set: fields });
    await audit({ actor: ctx.viewer, action: "survey.config", summary: "Changed the midpoint survey link" });
    revalidatePath("/admin/surveys");
    revalidatePath("/admin/settings");
    return { ok: true };
  });
