"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/features/admin/audit";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { aiKnowledgeArticles, aiSafetyAlerts } from "@/server/db/schema";
import { alertUpdateSchema, articleFormSchema, articleIdSchema } from "./schemas";

export const updateAlertAction = permissionAction("ai.review")
  .inputSchema(alertUpdateSchema)
  .action(async ({ parsedInput: { id, status, staffNote }, ctx: { viewer } }) => {
    const [alert] = await db
      .update(aiSafetyAlerts)
      .set({ status, staffNote: staffNote || null, handledBy: viewer.id, handledAt: new Date() })
      .where(eq(aiSafetyAlerts.id, id))
      .returning({ id: aiSafetyAlerts.id, userId: aiSafetyAlerts.userId });
    if (!alert) throw new UserFacingError("That alert no longer exists.");
    await audit({ actor: viewer, action: "ai.alert", targetIds: [alert.userId], summary: `AI Coach alert marked ${status.replace("_", " ")}`, meta: { alertId: id, status } });
    revalidatePath("/admin/ai", "layout");
    return { ok: true };
  });

export const saveArticleAction = permissionAction("content.manage")
  .inputSchema(articleFormSchema)
  .action(async ({ parsedInput: input, ctx: { viewer } }) => {
    if (input.published && !input.approved) {
      throw new UserFacingError("Only approved information can be published. Tick “Approved by the study team” first.");
    }
    const review = input.approved
      ? { needsReview: false, reviewedBy: viewer.id, reviewedAt: new Date() }
      : { needsReview: true, reviewedBy: null, reviewedAt: null };
    const fields = {
      title: input.title,
      topic: input.topic,
      body: input.body,
      sourceUrl: input.sourceUrl || null,
      published: input.published,
      updatedBy: viewer.id,
    };
    let id = input.id;
    if (id) {
      const [current] = await db.select({ needsReview: aiKnowledgeArticles.needsReview }).from(aiKnowledgeArticles).where(eq(aiKnowledgeArticles.id, id)).limit(1);
      if (!current) throw new UserFacingError("That article no longer exists.");
      // Keep the original reviewer when an approved article is saved again still approved.
      await db
        .update(aiKnowledgeArticles)
        .set({ ...fields, ...(input.approved && !current.needsReview ? {} : review) })
        .where(eq(aiKnowledgeArticles.id, id));
    } else {
      const [created] = await db.insert(aiKnowledgeArticles).values({ ...fields, ...review }).returning({ id: aiKnowledgeArticles.id });
      id = created.id;
    }
    await audit({
      actor: viewer,
      action: "ai.knowledge",
      summary: `${input.id ? "Updated" : "Created"} AI knowledge article “${input.title.slice(0, 80)}”${input.published ? " (published)" : ""}`,
      meta: { articleId: id, published: input.published, approved: input.approved },
    });
    revalidatePath("/admin/ai/knowledge", "layout");
    return { id };
  });

export const deleteArticleAction = permissionAction("content.manage")
  .inputSchema(articleIdSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const [deleted] = await db.delete(aiKnowledgeArticles).where(eq(aiKnowledgeArticles.id, id)).returning({ title: aiKnowledgeArticles.title });
    if (!deleted) throw new UserFacingError("That article no longer exists.");
    await audit({ actor: viewer, action: "ai.knowledge", summary: `Deleted AI knowledge article “${deleted.title.slice(0, 80)}”`, meta: { articleId: id } });
    revalidatePath("/admin/ai/knowledge", "layout");
    return { ok: true };
  });
