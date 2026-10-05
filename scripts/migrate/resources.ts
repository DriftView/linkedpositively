import { isNotNull, sql } from "drizzle-orm";
import { slugify as resourceSlug } from "@/features/resources/lib";
import { resourceFavorites, resourceReports, resources, resourceTags } from "@/server/db/schema";
import { nodes } from "./content";
import { q, type Ctx } from "./lib/context";
import { fv, fvAll, loadFields, str, ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Resource locator: tags (vocabulary resource_tags), resources (node type
 * `resources` + the ts_locations geocode cache), favourites (flag
 * favorite_resource) and "no longer available" reports (flag resource).
 * Ratings: Fivestar/VotingAPI tables are empty on the old site.
 */
export async function migrateResources(ctx: Ctx) {
  const map = await userMap(ctx);

  // ---- tags ----
  const terms = await q<{ tid: number; name: string }>(
    ctx.lp,
    "select t.tid, t.name from taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name = 'resource_tags' order by t.tid",
  );
  ctx.stats.source("resource_tags", terms.length);
  const byKey = new Map<string, number>(); // key → first tid
  const tidAlias = new Map<number, number>(); // tid → canonical tid
  const slugs = new Set<string>();
  const tagRows = [];
  for (const term of terms) {
    const name = term.name.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = name.toLowerCase();
    const first = byKey.get(key);
    if (first !== undefined) {
      tidAlias.set(term.tid, first);
      ctx.stats.skip("resource_tags", "same name as another tag (merged)");
      continue;
    }
    byKey.set(key, term.tid);
    tidAlias.set(term.tid, term.tid);
    const base = resourceSlug(name) || "tag";
    let slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
    slugs.add(slug);
    tagRows.push({ name, key, slug, ...legacy("lp", "taxonomy_term_data", term.tid) });
  }
  await upsertRows(ctx, "resource_tags", resourceTags, tagRows, { target: [resourceTags.key] });
  const tagIds = new Map(
    (await ctx.db.select({ id: resourceTags.id, legacyId: resourceTags.legacyId }).from(resourceTags).where(isNotNull(resourceTags.legacyId))).map(
      (t) => [t.legacyId!, t.id],
    ),
  );

  // ---- resources ----
  const rows = await nodes(ctx, ctx.lp, ["resources"]);
  ctx.stats.source("resources", rows.length);
  const fields = await loadFields(ctx.lp, "node", ["resources"], [
    "field_address",
    "field_city",
    "field_state",
    "field_zip",
    "field_website",
    "field_contact",
    "field_hours",
    "field_eligibility",
    "field_scheduling",
    "field_status",
    "field_tests",
    "field_resource_tags",
    "field_resource_description",
    "field_resource_tag",
  ]);
  const locations = await q<{ nid: number; lat: string; lng: string; created: number }>(ctx.lp, "select nid, lat, lng, created from ts_locations");
  const location = new Map(locations.map((l) => [Number(l.nid), l]));
  const out = [];
  for (const node of rows) {
    const id = node.nid;
    const loc = location.get(id);
    const lat = loc ? Number(loc.lat) : NaN;
    const lng = loc ? Number(loc.lng) : NaN;
    const geocoded = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const zip = str(fv(fields, id, "field_zip"));
    const tags = [
      ...new Set(
        fvAll(fields, id, "field_resource_tag", "tid")
          .map((tid) => tagIds.get(tidAlias.get(Number(tid)) ?? -1))
          .filter((v): v is string => !!v),
      ),
    ];
    const published = node.status === 1;
    const owner = map.lp.get(node.uid) ?? null;
    out.push({
      title: node.title.trim() || `Resource ${id}`,
      description: str(fv(fields, id, "field_resource_description")),
      address: str(fv(fields, id, "field_address")),
      city: str(fv(fields, id, "field_city")),
      state: str(fv(fields, id, "field_state")),
      zip,
      website: str(fv(fields, id, "field_website")),
      contact: str(fv(fields, id, "field_contact")),
      hours: str(fv(fields, id, "field_hours")),
      eligibility: str(fv(fields, id, "field_eligibility")),
      scheduling: str(fv(fields, id, "field_scheduling")),
      covidUpdates: str(fv(fields, id, "field_status")),
      insuranceStatus: str(fv(fields, id, "field_tests")),
      services: str(fv(fields, id, "field_resource_tags")),
      tagIds: tags,
      lat: geocoded ? lat : null,
      lng: geocoded ? lng : null,
      geocodeStatus: geocoded ? ("ok" as const) : zip ? ("pending" as const) : ("none" as const),
      geocodeAt: geocoded ? ts(loc!.created) : null,
      geocodeSource: geocoded ? "legacy" : null,
      // Unpublished nodes were participant suggestions waiting for review.
      status: published ? ("published" as const) : ("suggested" as const),
      authorId: owner,
      suggestedBy: published ? null : owner,
      publishedAt: published ? ts(node.created) : null,
      ...legacy("lp", "node", id),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "resources", resources, out);
  const resourceIds = new Map(
    (await ctx.db.select({ id: resources.id, legacyId: resources.legacyId }).from(resources).where(isNotNull(resources.legacyId))).map((r) => [
      r.legacyId!,
      r.id,
    ]),
  );

  // ---- favourites (flag favorite_resource, current state in `flagging`) ----
  const flags = await q<{ flagging_id: number; name: string; entity_id: number; uid: number; timestamp: number }>(
    ctx.lp,
    "select g.flagging_id, f.name, g.entity_id, g.uid, g.timestamp from flagging g join flag f using (fid) where f.name in ('favorite_resource', 'resource') order by g.flagging_id",
  );
  const favRows = [];
  const reportRows = [];
  for (const flag of flags) {
    const table = flag.name === "resource" ? "resource_reports" : "resource_favorites";
    ctx.stats.source(table, 1);
    const userId = map.lp.get(flag.uid);
    const resourceId = resourceIds.get(flag.entity_id);
    if (!userId) {
      ctx.stats.skip(table, "user not migrated (deleted account)");
      continue;
    }
    if (!resourceId) {
      ctx.stats.skip(table, "resource deleted");
      continue;
    }
    const row = { userId, resourceId, createdAt: ts(flag.timestamp) ?? new Date(0), ...legacy("lp", "flagging", flag.flagging_id) };
    if (flag.name === "resource") reportRows.push({ ...row, reason: "closed" as const });
    else favRows.push(row);
  }
  await upsertRows(ctx, "resource_favorites", resourceFavorites, favRows, { target: [resourceFavorites.userId, resourceFavorites.resourceId] });
  await upsertRows(ctx, "resource_reports", resourceReports, reportRows, { target: [resourceReports.userId, resourceReports.resourceId] });

  // Denormalised counters, as the app keeps them.
  if (!ctx.opts.dryRun) {
    await ctx.db.execute(sql`
      update ${resources} r set
        favorite_count = (select count(*)::int from ${resourceFavorites} f where f.resource_id = r.id),
        open_report_count = (select count(*)::int from ${resourceReports} p where p.resource_id = r.id and p.resolved_at is null)
      where r.legacy_id is not null and (
        r.favorite_count <> (select count(*)::int from ${resourceFavorites} f where f.resource_id = r.id) or
        r.open_report_count <> (select count(*)::int from ${resourceReports} p where p.resource_id = r.id and p.resolved_at is null))`);
  }
}
