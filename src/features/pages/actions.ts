"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { awardGuidelinesRead } from "@/features/gamification/points";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { pages } from "@/server/db/schema";
import { sanitizeStaffHtml } from "@/server/services/sanitize";
import { trackUsage } from "@/server/services/usage";

/** The page whose first view earns points (P7, "community-view"). */
const GUIDELINES_SLUG = "community-guidelines";

const RESERVED = new Set(["new", "edit", "admin"]);

const pageSchema = z.object({
  id: uuidSchema.optional(),
  title: z.string().trim().min(2, "Add a title").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Add an address")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and dashes")
    .refine((slug) => !RESERVED.has(slug), "That address is reserved"),
  summary: z.string().trim().max(300).default(""),
  bodyHtml: z.string().max(200_000),
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(value), "Use a YouTube or Vimeo link")
    .default(""),
  status: z.enum(["published", "draft"]),
  audience: z.enum(["everyone", "staff"]),
  inMenu: z.boolean(),
  order: z.number().int().min(0).max(999),
  needsReview: z.boolean(),
});
export type PageFormInput = z.input<typeof pageSchema>;

export const savePageAction = permissionAction("content.manage")
  .inputSchema(pageSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const [clash] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.slug, input.slug), input.id ? ne(pages.id, input.id) : undefined))
      .limit(1);
    if (clash) throw new UserFacingError("Another page already uses that address.");
    const fields = {
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      bodyHtml: sanitizeStaffHtml(input.bodyHtml),
      videoUrl: input.videoUrl,
      status: input.status,
      audience: input.audience,
      inMenu: input.inMenu,
      order: input.order,
      needsReview: input.needsReview,
      updatedBy: ctx.viewer.id,
    };
    let id = input.id;
    let previousSlug: string | null = null;
    if (id) {
      const [before] = await db.select({ slug: pages.slug }).from(pages).where(eq(pages.id, id)).limit(1);
      if (!before) throw new UserFacingError("That page was deleted.");
      previousSlug = before.slug;
      // Keep the old address working after a rename.
      const oldSlug = previousSlug;
      await db
        .update(pages)
        .set({
          ...fields,
          ...(oldSlug !== input.slug
            ? {
                aliases: sql`case when ${oldSlug}::text = any(${pages.aliases}) then ${pages.aliases} else array_append(${pages.aliases}, ${oldSlug}::text) end`,
              }
            : {}),
        })
        .where(eq(pages.id, id));
    } else {
      const [created] = await db.insert(pages).values(fields).returning({ id: pages.id });
      id = created.id;
    }
    revalidatePath("/pages");
    revalidatePath(`/pages/${input.slug}`);
    if (previousSlug && previousSlug !== input.slug) revalidatePath(`/pages/${previousSlug}`);
    revalidatePath("/admin/content/pages");
    return { id, slug: input.slug };
  });

export const deletePageAction = permissionAction("content.manage")
  .inputSchema(z.object({ id: uuidSchema }))
  .action(async ({ parsedInput }) => {
    const deleted = await db.delete(pages).where(eq(pages.id, parsedInput.id)).returning({ id: pages.id });
    if (!deleted.length) throw new UserFacingError("That page was already deleted.");
    revalidatePath("/pages");
    revalidatePath("/admin/content/pages");
    return { ok: true };
  });

/**
 * Records a page view. Reading the community guidelines earns points once
 * (awarded from the client so link prefetches don't count).
 */
export const recordPageViewAction = authedAction
  .inputSchema(z.object({ slug: z.string().max(80) }))
  .action(async ({ parsedInput, ctx }) => {
    const [page] = await db
      .select({ id: pages.id, slug: pages.slug })
      .from(pages)
      .where(and(eq(pages.slug, parsedInput.slug), eq(pages.status, "published")))
      .limit(1);
    if (!page) return { awarded: false };
    await trackUsage(ctx.viewer.id, "page_view", { pageId: page.id });
    if (page.slug !== GUIDELINES_SLUG) return { awarded: false };
    const result = await awardGuidelinesRead(ctx.viewer.id);
    return { awarded: result.awarded, points: result.awarded ? result.points : 0 };
  });
