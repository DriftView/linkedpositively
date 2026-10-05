"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { glossaryTerms } from "@/server/db/schema";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";
import { trackUsage } from "@/server/services/usage";
import { termLetter, termSlug } from "./lib";

const termSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1, "Add the term").max(120),
  definitionHtml: z.string().max(20_000),
});

export const saveGlossaryTermAction = permissionAction("content.manage")
  .inputSchema(termSchema)
  .action(async ({ parsedInput, ctx }) => {
    const definitionHtml = sanitizeStaffHtml(parsedInput.definitionHtml);
    const definitionText = toPlainText(definitionHtml);
    if (!definitionText) throw new UserFacingError("Add a definition.");
    const slug = termSlug(parsedInput.name);
    const [clash] = await db
      .select({ name: glossaryTerms.name })
      .from(glossaryTerms)
      .where(and(eq(glossaryTerms.slug, slug), parsedInput.id ? ne(glossaryTerms.id, parsedInput.id) : undefined))
      .limit(1);
    if (clash) throw new UserFacingError(`"${clash.name}" is already in the glossary.`);
    const fields = {
      name: parsedInput.name,
      slug,
      letter: termLetter(parsedInput.name),
      definitionHtml,
      definitionText,
      updatedBy: ctx.viewer.id,
    };
    let id = parsedInput.id;
    if (id) {
      const updated = await db.update(glossaryTerms).set(fields).where(eq(glossaryTerms.id, id)).returning({ id: glossaryTerms.id });
      if (!updated.length) throw new UserFacingError("That term was deleted.");
    } else {
      const [created] = await db.insert(glossaryTerms).values(fields).returning({ id: glossaryTerms.id });
      id = created.id;
    }
    revalidatePath("/glossary");
    revalidatePath("/admin/content/glossary");
    return { id, slug };
  });

export const deleteGlossaryTermAction = permissionAction("content.manage")
  .inputSchema(z.object({ id: uuidSchema }))
  .action(async ({ parsedInput }) => {
    await db.delete(glossaryTerms).where(eq(glossaryTerms.id, parsedInput.id));
    revalidatePath("/glossary");
    revalidatePath("/admin/content/glossary");
    return { ok: true };
  });

export const recordGlossaryViewAction = authedAction.action(async ({ ctx }) => {
  await trackUsage(ctx.viewer.id, "glossary_view");
  return { ok: true };
});
