"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/features/admin/audit";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { smsInbound, smsSends, smsTemplates } from "@/server/db/schema";
import { sendSms } from "@/server/services/sms";
import { appUrl, safeInternalPath } from "./links";
import { normalizePhone } from "./phone";
import { DEFAULT_TEMPLATES, LINK_TOKEN, MEDIA_OPTIONS, LINK_TARGETS, renderSmsBody, weekFromKey } from "./program";
import { cancelMessage, resendMessage } from "./service";

const LINK_PATHS = LINK_TARGETS.map((target) => target.path) as string[];

const templateSchema = z
  .object({
    key: z.string().regex(/^(WELCOME|WEEK-\d{1,2})$/),
    body: z.string().trim().min(1, "Write the message.").max(1000, "Keep the message under 1,000 characters."),
    linkPath: z.string().max(200),
    mediaPath: z.string().max(200),
    active: z.boolean(),
  })
  .refine((value) => (value.body.match(/<link>/g) ?? []).length <= 1, { message: "Use <link> at most once.", path: ["body"] })
  .refine((value) => !value.body.includes(LINK_TOKEN) || LINK_PATHS.includes(value.linkPath), {
    message: "Choose where the link goes.",
    path: ["linkPath"],
  })
  .refine((value) => value.mediaPath === "" || MEDIA_OPTIONS.includes(value.mediaPath), { message: "Choose an image from the list.", path: ["mediaPath"] });

function revalidateSms() {
  revalidatePath("/admin/content/sms");
  revalidatePath("/admin/content/sms/log");
}

export const saveTemplateAction = permissionAction("sms.manage")
  .inputSchema(templateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const week = weekFromKey(input.key);
    if (week === null) throw new UserFacingError("Unknown message.");
    const fields = {
      week,
      body: input.body,
      linkPath: input.body.includes(LINK_TOKEN) ? input.linkPath : "",
      mediaPath: input.mediaPath,
      active: input.active,
      updatedBy: ctx.viewer.id,
      updatedAt: new Date(),
    };
    await db
      .insert(smsTemplates)
      .values({ key: input.key, ...fields })
      .onConflictDoUpdate({ target: smsTemplates.key, set: fields });
    await audit({ actor: ctx.viewer, action: "sms.template", summary: `Edited the ${input.key} text` });
    revalidateSms();
    return { ok: true };
  });

export const resetTemplateAction = permissionAction("sms.manage")
  .inputSchema(z.object({ key: z.string().regex(/^(WELCOME|WEEK-\d{1,2})$/) }))
  .action(async ({ parsedInput, ctx }) => {
    const original = DEFAULT_TEMPLATES.find((template) => template.key === parsedInput.key);
    if (!original) throw new UserFacingError("Unknown message.");
    const fields = { ...original, active: true, updatedBy: ctx.viewer.id, updatedAt: new Date() };
    await db.insert(smsTemplates).values(fields).onConflictDoUpdate({ target: smsTemplates.key, set: fields });
    await audit({ actor: ctx.viewer, action: "sms.template", summary: `Restored the original ${original.key} text` });
    revalidateSms();
    return { template: { ...original, active: true } };
  });

/** Sends the draft to a staff member's phone (with a plain link instead of a tracked one). */
export const sendTestAction = permissionAction("sms.manage")
  .inputSchema(
    z.object({
      to: z.string().trim().max(30),
      body: z.string().trim().min(1).max(1000),
      linkPath: z.string().max(200),
      mediaPath: z.string().max(200),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const to = normalizePhone(parsedInput.to);
    if (!to) throw new UserFacingError("Enter a valid phone number with country code. Eg. +19879543210");
    if (parsedInput.mediaPath && !MEDIA_OPTIONS.includes(parsedInput.mediaPath)) throw new UserFacingError("Choose an image from the list.");
    const link = parsedInput.body.includes(LINK_TOKEN) ? appUrl(safeInternalPath(parsedInput.linkPath)) : null;
    const result = await sendSms({
      to,
      body: renderSmsBody(parsedInput.body, link),
      mediaUrl: parsedInput.mediaPath ? appUrl(parsedInput.mediaPath) : undefined,
      ref: `sms-test:${ctx.viewer.id}`,
    });
    if (!result.ok) throw new UserFacingError("The test text couldn't be sent. Check the Twilio settings.");
    await audit({ actor: ctx.viewer, action: "sms.test", summary: "Sent a test text" });
    return { sid: result.sid };
  });

export const resendAction = permissionAction("sms.manage")
  .inputSchema(z.object({ sendId: uuidSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const [send] = await db
      .select({ userId: smsSends.userId, flag: smsSends.flag, status: smsSends.status })
      .from(smsSends)
      .where(eq(smsSends.id, parsedInput.sendId))
      .limit(1);
    if (!send) throw new UserFacingError("That message no longer exists.");
    if (send.status === "sent") throw new UserFacingError("This message was already sent.");
    const outcome = await resendMessage(parsedInput.sendId, ctx.viewer.id);
    if (!outcome) throw new UserFacingError("This message is being sent right now.");
    await audit({
      actor: ctx.viewer,
      action: "sms.resend",
      targetIds: [send.userId],
      summary: `Sent the ${send.flag} text by hand (${outcome})`,
    });
    revalidateSms();
    return { outcome };
  });

export const cancelSendAction = permissionAction("sms.manage")
  .inputSchema(z.object({ sendId: uuidSchema }))
  .action(async ({ parsedInput, ctx }) => {
    const [send] = await db
      .select({ userId: smsSends.userId, flag: smsSends.flag })
      .from(smsSends)
      .where(eq(smsSends.id, parsedInput.sendId))
      .limit(1);
    if (!send) throw new UserFacingError("That message no longer exists.");
    if (!(await cancelMessage(parsedInput.sendId, ctx.viewer.id))) throw new UserFacingError("Only upcoming messages can be cancelled.");
    await audit({ actor: ctx.viewer, action: "sms.cancel", targetIds: [send.userId], summary: `Cancelled the ${send.flag} text` });
    revalidateSms();
    return { ok: true };
  });

export const markInboundReadAction = permissionAction("sms.manage")
  .inputSchema(z.object({ ids: z.array(uuidSchema).min(1).max(500) }))
  .action(async ({ parsedInput }) => {
    await db
      .update(smsInbound)
      .set({ readAt: new Date() })
      .where(and(inArray(smsInbound.id, parsedInput.ids), isNull(smsInbound.readAt)));
    revalidatePath("/admin/content/sms/replies");
    return { ok: true };
  });
