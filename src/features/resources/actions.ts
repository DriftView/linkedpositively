"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { award } from "@/features/gamification/points";
import { dayKey } from "@/lib/dates";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { resourceFavorites, resourceRatings, resourceReports, resources, users } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { sendMail } from "@/server/services/mail";
import { trackUsage } from "@/server/services/usage";
import { ResourceSuggestedEmail } from "./emails/resource-suggested";
import { geocodeResource } from "./geocode";
import { websiteHref } from "./lib";
import { favoriteSchema, rateSchema, reportSchema, suggestSchema } from "./schemas";
import { recountFavorites, recountRatings, recountReports } from "./service";

async function publishedResource(resourceId: string) {
  const [resource] = await db
    .select({ id: resources.id, title: resources.title })
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.status, "published")))
    .limit(1);
  if (!resource) throw new UserFacingError("That resource isn't available any more.");
  return resource;
}

/** Save / unsave (Drupal flag favorite_resource). Idempotent. */
export const toggleFavoriteAction = permissionAction("resources.view")
  .inputSchema(favoriteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const resource = await publishedResource(parsedInput.resourceId);
    if (parsedInput.favorite) {
      await db.insert(resourceFavorites).values({ userId: ctx.viewer.id, resourceId: resource.id }).onConflictDoNothing({
        target: [resourceFavorites.userId, resourceFavorites.resourceId],
      });
    } else {
      await db
        .delete(resourceFavorites)
        .where(and(eq(resourceFavorites.userId, ctx.viewer.id), eq(resourceFavorites.resourceId, resource.id)));
    }
    const count = await recountFavorites(resource.id);
    revalidatePath("/resources/saved");
    return { favorited: parsedInput.favorite, count };
  });

/**
 * Star rating (re-rating allowed, like Fivestar's allow_revote). Points (P8)
 * are awarded once per resource instead of on every vote.
 */
export const rateResourceAction = permissionAction("resources.view")
  .inputSchema(rateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const resource = await publishedResource(parsedInput.resourceId);
    await db
      .insert(resourceRatings)
      .values({ userId: ctx.viewer.id, resourceId: resource.id, value: parsedInput.value })
      .onConflictDoUpdate({
        target: [resourceRatings.userId, resourceRatings.resourceId],
        set: { value: parsedInput.value, updatedAt: new Date() },
      });
    const stats = await recountRatings(resource.id);
    await award({ userId: ctx.viewer.id, reason: "resource_rating", key: `resource-rating:${resource.id}` });
    return { ...stats, mine: parsedInput.value };
  });

/** "This place has closed / the details are wrong" (Drupal flag `resource`). */
export const reportResourceAction = permissionAction("resources.view")
  .inputSchema(reportSchema)
  .action(async ({ parsedInput, ctx }) => {
    const resource = await publishedResource(parsedInput.resourceId);
    const fields = { reason: parsedInput.reason, note: parsedInput.note || null, createdAt: new Date() };
    await db
      .insert(resourceReports)
      .values({ userId: ctx.viewer.id, resourceId: resource.id, ...fields })
      .onConflictDoUpdate({
        target: [resourceReports.userId, resourceReports.resourceId],
        set: { ...fields, resolvedAt: null, resolvedBy: null, resolution: null },
      });
    await recountReports(resource.id);
    revalidatePath("/admin/content/resources");
    return { reported: parsedInput.reason };
  });

/**
 * Records a visit to the locator (P10, once a day instead of on every form
 * build) or to one resource page (usage only).
 */
export const recordResourceVisitAction = permissionAction("resources.view")
  .inputSchema(z.object({ resourceId: uuidSchema.optional() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.resourceId) {
      await trackUsage(ctx.viewer.id, "resource_view", { resourceId: parsedInput.resourceId });
      return { ok: true };
    }
    await trackUsage(ctx.viewer.id, "resource_search");
    await award({ userId: ctx.viewer.id, reason: "resource_view", key: `resource-locator:${dayKey(new Date(), ctx.viewer.timezone)}` });
    return { ok: true };
  });

/**
 * "Suggest a resource": creates a hidden suggestion and emails every active
 * coordinator (docs/legacy/04 §4.1).
 */
export const suggestResourceAction = permissionAction("resources.suggest")
  .inputSchema(suggestSchema)
  .action(async ({ parsedInput, ctx }) => {
    const [{ recent }] = await db
      .select({ recent: count() })
      .from(resources)
      .where(and(eq(resources.suggestedBy, ctx.viewer.id), gt(resources.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
    if (recent >= 10) throw new UserFacingError("Thanks for all the suggestions! Please try again in a little while.");

    const [resource] = await db
      .insert(resources)
      .values({
        title: parsedInput.name,
        contact: parsedInput.phone,
        address: parsedInput.street,
        city: parsedInput.city,
        state: parsedInput.state,
        zip: parsedInput.zip,
        website: websiteHref(parsedInput.website) ?? null,
        description: parsedInput.notes,
        status: "suggested",
        authorId: ctx.viewer.id,
        suggestedBy: ctx.viewer.id,
        geocodeStatus: "none",
      })
      .returning({ id: resources.id, title: resources.title, city: resources.city });
    await geocodeResource(resource.id);

    try {
      const coordinators = await db
        .select({ email: users.email })
        .from(users)
        .where(
          and(
            sql`${users.role} ~ '(^|,)\\s*coordinator\\s*(,|$)'`,
            sql`${users.banned} is not true`,
            isNotNull(users.email),
            ne(users.email, ""),
          ),
        );
      const reviewUrl = `${env.NEXT_PUBLIC_APP_URL}/admin/content/resources?tab=suggested`;
      await Promise.all(
        coordinators.map((coordinator) =>
          sendMail({
            to: coordinator.email,
            subject: "Link Positively: a new resource was suggested",
            template: ResourceSuggestedEmail({ title: resource.title, city: resource.city ?? undefined, reviewUrl }),
            ref: `resource-suggested:${resource.id}`,
          }),
        ),
      );
    } catch (error) {
      logger.error({ resourceId: resource.id, err: (error as Error).message }, "suggestion email failed");
    }
    revalidatePath("/admin/content/resources");
    return { id: resource.id };
  });
