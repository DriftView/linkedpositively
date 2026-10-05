import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import { resourceFavorites, resourceRatings, resourceReports, resources, resourceTags } from "@/server/db/schema";
import { slugify } from "./lib";

/** Finds or creates tags by name (case-insensitive), returning their ids in order. */
export async function resolveTagIds(names: string[]) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    let [tag] = await db.select({ id: resourceTags.id }).from(resourceTags).where(eq(resourceTags.key, key)).limit(1);
    if (!tag) {
      const base = slugify(name) || "tag";
      let slug = base;
      for (let attempt = 2; ; attempt++) {
        const [taken] = await db.select({ id: resourceTags.id }).from(resourceTags).where(eq(resourceTags.slug, slug)).limit(1);
        if (!taken) break;
        slug = `${base}-${attempt}`;
      }
      // A concurrent insert of the same key (or slug) is not an error: look it up again.
      [tag] = await db.insert(resourceTags).values({ name, key, slug }).onConflictDoNothing().returning({ id: resourceTags.id });
      if (!tag) [tag] = await db.select({ id: resourceTags.id }).from(resourceTags).where(eq(resourceTags.key, key)).limit(1);
    }
    if (tag) ids.push(tag.id);
  }
  return ids;
}

export async function recountRatings(resourceId: string) {
  const [row] = await db
    .update(resources)
    .set({
      ratingAverage: sql`coalesce((select round(avg(${resourceRatings.value})::numeric, 1)::float8 from ${resourceRatings} where ${resourceRatings.resourceId} = ${resourceId}), 0)`,
      ratingCount: sql`(select count(*)::int from ${resourceRatings} where ${resourceRatings.resourceId} = ${resourceId})`,
    })
    .where(eq(resources.id, resourceId))
    .returning({ ratingAverage: resources.ratingAverage, ratingCount: resources.ratingCount });
  return { ratingAverage: row?.ratingAverage ?? 0, ratingCount: row?.ratingCount ?? 0 };
}

export async function recountFavorites(resourceId: string) {
  const [row] = await db
    .update(resources)
    .set({
      favoriteCount: sql`(select count(*)::int from ${resourceFavorites} where ${resourceFavorites.resourceId} = ${resourceId})`,
    })
    .where(eq(resources.id, resourceId))
    .returning({ favoriteCount: resources.favoriteCount });
  return row?.favoriteCount ?? 0;
}

export async function recountReports(resourceId: string, executor: Executor = db) {
  const [row] = await executor
    .update(resources)
    .set({
      openReportCount: sql`(select count(*)::int from ${resourceReports} where ${resourceReports.resourceId} = ${resourceId} and ${resourceReports.resolvedAt} is null)`,
    })
    .where(eq(resources.id, resourceId))
    .returning({ openReportCount: resources.openReportCount });
  return row?.openReportCount ?? 0;
}

/** Closes every open report on these resources. */
export async function resolveReports(
  resourceIds: string[],
  resolution: "unpublished" | "dismissed" | "deleted",
  staffId: string,
  executor: Executor = db,
) {
  if (!resourceIds.length) return;
  await executor
    .update(resourceReports)
    .set({ resolvedAt: new Date(), resolvedBy: staffId, resolution })
    .where(and(inArray(resourceReports.resourceId, resourceIds), isNull(resourceReports.resolvedAt)));
  await executor.update(resources).set({ openReportCount: 0 }).where(inArray(resources.id, resourceIds));
}
