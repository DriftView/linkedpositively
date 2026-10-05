"use server";

import { revalidatePath } from "next/cache";
import { desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { journeyCategories, journeyGoals, journeyMethods } from "@/server/db/schema";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { slugify } from "@/features/resources/lib";

const objectId = uuidSchema;

function revalidate() {
  revalidatePath("/admin/content/journey", "layout");
  revalidatePath("/journey", "layout");
}

const categorySchema = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(2, "Add a name").max(120),
  description: z.string().trim().max(500).default(""),
  accent: z.enum(["plum", "magenta", "sky", "apricot", "pink"]),
  published: z.boolean(),
});

export const saveCategoryAction = permissionAction("content.manage")
  .inputSchema(categorySchema)
  .action(async ({ parsedInput }) => {
    const fields = { name: parsedInput.name, description: parsedInput.description, accent: parsedInput.accent, published: parsedInput.published };
    if (parsedInput.id) {
      const result = await db
        .update(journeyCategories)
        .set(fields)
        .where(eq(journeyCategories.id, parsedInput.id))
        .returning({ id: journeyCategories.id });
      if (!result.length) throw new UserFacingError("That area was deleted.");
      revalidate();
      return { id: parsedInput.id };
    }
    const base = slugify(parsedInput.name) || "area";
    const likeBase = base.replace(/[\\%_]/g, "\\$&");
    const taken = new Set(
      (
        await db
          .select({ slug: journeyCategories.slug })
          .from(journeyCategories)
          .where(or(eq(journeyCategories.slug, base), like(journeyCategories.slug, `${likeBase}-%`)))
      ).map((row) => row.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const [last] = await db
      .select({ order: journeyCategories.order })
      .from(journeyCategories)
      .orderBy(desc(journeyCategories.order))
      .limit(1);
    const [doc] = await db
      .insert(journeyCategories)
      .values({ ...fields, slug, order: (last?.order ?? -1) + 1 })
      .returning({ id: journeyCategories.id });
    revalidate();
    return { id: doc!.id };
  });

/** Deletes an area with its methods and goal ideas (FK cascade). Members' goals keep their copied names. */
export const deleteCategoryAction = permissionAction("content.manage")
  .inputSchema(z.object({ id: objectId }))
  .action(async ({ parsedInput }) => {
    await db.delete(journeyCategories).where(eq(journeyCategories.id, parsedInput.id));
    revalidate();
    return { ok: true };
  });

const itemSchema = z.object({
  kind: z.enum(["method", "goal"]),
  id: objectId.optional(),
  parentId: objectId,
  name: z.string().trim().min(2, "Too short").max(300),
});

export const saveJourneyItemAction = permissionAction("content.manage")
  .inputSchema(itemSchema)
  .action(async ({ parsedInput }) => {
    const { name, parentId } = parsedInput;
    if (parsedInput.kind === "method") {
      if (parsedInput.id) {
        await db.update(journeyMethods).set({ name }).where(eq(journeyMethods.id, parsedInput.id));
        revalidate();
        return { id: parsedInput.id };
      }
      const [parent] = await db
        .select({ id: journeyCategories.id })
        .from(journeyCategories)
        .where(eq(journeyCategories.id, parentId))
        .limit(1);
      if (!parent) throw new UserFacingError("That section was deleted.");
      const [doc] = await db
        .insert(journeyMethods)
        .values({
          categoryId: parentId,
          name,
          order: sql`(select coalesce(max(${journeyMethods.order}), -1) + 1 from ${journeyMethods} where ${journeyMethods.categoryId} = ${parentId})`,
        })
        .returning({ id: journeyMethods.id });
      revalidate();
      return { id: doc!.id };
    }

    if (parsedInput.id) {
      await db.update(journeyGoals).set({ name }).where(eq(journeyGoals.id, parsedInput.id));
      revalidate();
      return { id: parsedInput.id };
    }
    const [parent] = await db
      .select({ id: journeyMethods.id })
      .from(journeyMethods)
      .where(eq(journeyMethods.id, parentId))
      .limit(1);
    if (!parent) throw new UserFacingError("That section was deleted.");
    const [doc] = await db
      .insert(journeyGoals)
      .values({
        methodId: parentId,
        name,
        order: sql`(select coalesce(max(${journeyGoals.order}), -1) + 1 from ${journeyGoals} where ${journeyGoals.methodId} = ${parentId})`,
      })
      .returning({ id: journeyGoals.id });
    revalidate();
    return { id: doc!.id };
  });

export const deleteJourneyItemAction = permissionAction("content.manage")
  .inputSchema(z.object({ kind: z.enum(["method", "goal"]), id: objectId }))
  .action(async ({ parsedInput }) => {
    // A method's goal ideas go with it (FK cascade).
    if (parsedInput.kind === "goal") await db.delete(journeyGoals).where(eq(journeyGoals.id, parsedInput.id));
    else await db.delete(journeyMethods).where(eq(journeyMethods.id, parsedInput.id));
    revalidate();
    return { ok: true };
  });

/** Saves a new order for areas, methods or goals (ids in display order). */
export const reorderJourneyAction = permissionAction("content.manage")
  .inputSchema(z.object({ kind: z.enum(["category", "method", "goal"]), ids: z.array(objectId).min(1).max(200) }))
  .action(async ({ parsedInput }) => {
    const table =
      parsedInput.kind === "category" ? journeyCategories : parsedInput.kind === "method" ? journeyMethods : journeyGoals;
    const cases = sql.join(
      parsedInput.ids.map((id, order) => sql`when ${id}::uuid then ${order}::int`),
      sql` `,
    );
    await db
      .update(table)
      .set({ order: sql`case ${table.id} ${cases} end` })
      .where(inArray(table.id, parsedInput.ids));
    revalidate();
    return { ok: true };
  });
