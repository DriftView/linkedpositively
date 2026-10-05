"use server";

import { revalidatePath } from "next/cache";
import { and, arrayContains, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db, withTransaction } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { tips, tipTags } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";
import { deleteFile, MAX_UPLOAD_BYTES, putFile } from "@/server/services/storage";
import { deleteTargetDiscussion } from "@/features/community/service";
import { tagInputSchema, tipInputSchema } from "./schemas";

/** Staff actions for Thrive Tips content (/admin/content/tips). */

const manage = permissionAction("content.manage");

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 140) || "topic"
  );
}

function revalidateTips() {
  revalidatePath("/admin/content/tips", "layout");
  revalidatePath("/tips", "layout");
}

export const saveTip = manage.inputSchema(tipInputSchema).action(async ({ parsedInput: input, ctx }) => {
  const tagIds = [...new Set(input.tagIds)];
  const refs = [...new Set([...tagIds, ...(input.categoryId ? [input.categoryId] : [])])];
  const found = await db
    .select({ id: tipTags.id, name: tipTags.name, kind: tipTags.kind })
    .from(tipTags)
    .where(inArray(tipTags.id, refs));
  if (found.length !== refs.length) throw new UserFacingError("One of the topics no longer exists. Refresh and try again.");

  const html = sanitizeStaffHtml(input.html);
  const tagNames = found.filter((t) => t.kind === "tag").map((t) => t.name);
  // Empty optional fields are stored as NULL (Mongo unset them).
  const doc = {
    title: input.title,
    type: input.type,
    template: (input.template || null) as (typeof tips.$inferInsert)["template"],
    html,
    description: input.description,
    pullquote: input.pullquote || null,
    videoUrl: input.videoUrl || null,
    link: input.link || null,
    pdfKey: input.pdfKey || null,
    pdfName: input.pdfName || null,
    tagIds,
    categoryId: input.categoryId || null,
    displayDay: input.displayDay ?? null,
    displayDayTwo: input.displayDayTwo ?? null,
    rule: input.rule ?? null,
    published: input.published,
    searchText: [input.title, toPlainText(html), input.description, tagNames.join(" ")].join(" "),
  };

  let id = input.id;
  if (id) {
    const [before] = await db.select({ pdfKey: tips.pdfKey }).from(tips).where(eq(tips.id, id)).limit(1);
    if (!before) throw new UserFacingError("This tip was deleted by someone else.");
    await db.update(tips).set(doc).where(eq(tips.id, id));
    if (before.pdfKey && before.pdfKey !== input.pdfKey) {
      await deleteFile(before.pdfKey).catch((err: Error) => logger.warn({ err: err.message }, "old tip pdf not deleted"));
    }
  } else {
    const [created] = await db
      .insert(tips)
      .values({ ...doc, authorId: ctx.viewer.id })
      .returning({ id: tips.id });
    id = created!.id;
  }
  revalidateTips();
  return { id };
});

export const deleteTips = manage
  .inputSchema(z.object({ ids: z.array(uuidSchema).min(1).max(500) }))
  .action(async ({ parsedInput }) => {
    const ids = parsedInput.ids;
    const pdfs = await db
      .select({ pdfKey: tips.pdfKey })
      .from(tips)
      .where(and(inArray(tips.id, ids), isNotNull(tips.pdfKey)));
    // Favourites and views go with the tip (FK cascade); comments and reactions in the same transaction.
    const deleted = await withTransaction(async (tx) => {
      const result = await tx.delete(tips).where(inArray(tips.id, ids)).returning({ id: tips.id });
      await deleteTargetDiscussion("tip", ids, tx);
      return result.length;
    });
    for (const { pdfKey } of pdfs) {
      if (pdfKey) await deleteFile(pdfKey).catch(() => undefined);
    }
    revalidateTips();
    return { deleted };
  });

export const setTipsPublished = manage
  .inputSchema(z.object({ ids: z.array(uuidSchema).min(1).max(500), published: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const result = await db
      .update(tips)
      .set({ published: parsedInput.published })
      .where(and(inArray(tips.id, parsedInput.ids), ne(tips.published, parsedInput.published)))
      .returning({ id: tips.id });
    revalidateTips();
    return { updated: result.length };
  });

export const uploadTipPdf = manage
  .inputSchema(z.object({ file: z.instanceof(File) }))
  .action(async ({ parsedInput: { file } }) => {
    if (file.type !== "application/pdf") throw new UserFacingError("Please choose a PDF file.");
    if (file.size > MAX_UPLOAD_BYTES) throw new UserFacingError("That PDF is larger than 8 MB.");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new UserFacingError("That file doesn't look like a PDF.");
    const key = await putFile("tips", buffer, "application/pdf");
    return { key, name: file.name.replace(/[^\w .()-]/g, "").slice(0, 120) || "guide.pdf" };
  });

export const saveTipTag = manage.inputSchema(tagInputSchema).action(async ({ parsedInput: input }) => {
  const slug = slugify(input.name);
  const [clash] = await db
    .select({ id: tipTags.id })
    .from(tipTags)
    .where(and(eq(tipTags.kind, input.kind), eq(tipTags.slug, slug), input.id ? ne(tipTags.id, input.id) : undefined))
    .limit(1);
  if (clash) throw new UserFacingError(`There's already a ${input.kind === "tag" ? "topic" : "category"} called “${input.name}”.`);
  if (input.id) {
    const [updated] = await db
      .update(tipTags)
      .set({ name: input.name, slug, description: input.description })
      .where(and(eq(tipTags.id, input.id), eq(tipTags.kind, input.kind)))
      .returning({ id: tipTags.id, name: tipTags.name, slug: tipTags.slug });
    if (!updated) throw new UserFacingError("That topic no longer exists.");
    revalidateTips();
    return updated;
  }
  const [created] = await db
    .insert(tipTags)
    .values({ kind: input.kind, name: input.name, slug, description: input.description })
    .returning({ id: tipTags.id, name: tipTags.name, slug: tipTags.slug });
  revalidateTips();
  return created!;
});

export const deleteTipTag = manage.inputSchema(z.object({ id: uuidSchema })).action(async ({ parsedInput }) => {
  const id = parsedInput.id;
  await withTransaction(async (tx) => {
    await tx
      .update(tips)
      .set({ tagIds: sql`array_remove(${tips.tagIds}, ${id}::uuid)` })
      .where(arrayContains(tips.tagIds, [id]));
    await tx.update(tips).set({ categoryId: null }).where(eq(tips.categoryId, id));
    await tx.delete(tipTags).where(eq(tipTags.id, id));
  });
  revalidateTips();
  return { ok: true };
});

/** Moves every tip from `sourceId` to `targetId`, then deletes the source (Drupal term_merge). */
export const mergeTipTags = manage
  .inputSchema(z.object({ sourceId: uuidSchema, targetId: uuidSchema }))
  .action(async ({ parsedInput }) => {
    if (parsedInput.sourceId === parsedInput.targetId) throw new UserFacingError("Pick a different topic to merge into.");
    const found = await db
      .select({ id: tipTags.id, kind: tipTags.kind })
      .from(tipTags)
      .where(inArray(tipTags.id, [parsedInput.sourceId, parsedInput.targetId]));
    const source = found.find((t) => t.id === parsedInput.sourceId);
    const target = found.find((t) => t.id === parsedInput.targetId);
    if (!source || !target) throw new UserFacingError("One of those topics no longer exists.");
    if (source.kind !== target.kind) throw new UserFacingError("Topics can only be merged into topics, and categories into categories.");
    const from = source.id;
    const to = target.id;
    await withTransaction(async (tx) => {
      if (source.kind === "tag") {
        // $addToSet the target, then $pull the source.
        await tx
          .update(tips)
          .set({
            tagIds: sql`array_remove(case when ${to}::uuid = any(${tips.tagIds}) then ${tips.tagIds} else array_append(${tips.tagIds}, ${to}::uuid) end, ${from}::uuid)`,
          })
          .where(arrayContains(tips.tagIds, [from]));
      } else {
        await tx.update(tips).set({ categoryId: to }).where(eq(tips.categoryId, from));
      }
      await tx.delete(tipTags).where(eq(tipTags.id, from));
    });
    revalidateTips();
    return { ok: true };
  });
