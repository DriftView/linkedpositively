import { isNotNull } from "drizzle-orm";
import { tipFavorites, tips, tipTags, tipViews, TAILORING_FIELDS, TAILORING_OPERATORS, TIP_TEMPLATES } from "@/server/db/schema";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";
import { nodes } from "./content";
import { q, type Ctx } from "./lib/context";
import { fv, fvAll, int, loadFields, slugify, str, ts } from "./lib/drupal";
import { uploadBuffer, storedKeyExists } from "./lib/files";
import { legacy, legacyUuid, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/** Thrive Tips: topics/categories, tips (with their inline images), favourites and view counters. */

const TIP_TYPE: Record<string, "html" | "video" | "pdf" | "offsite"> = {
  Html: "html",
  Video: "video",
  Pdf: "pdf",
  "Offsite Content": "offsite",
};

type LegacyImage = { key: string; type: string; alt?: string; width?: number; height?: number };

export async function migrateTips(ctx: Ctx) {
  // ---- tags (thrive_tips_tags) and categories (thrive_tips_categories) ----
  const terms = await q<{ tid: number; name: string; description: string | null; weight: number; vocab: string }>(
    ctx.lp,
    `select t.tid, t.name, t.description, t.weight, v.machine_name vocab from taxonomy_term_data t join taxonomy_vocabulary v using (vid)
     where v.machine_name in ('thrive_tips_tags', 'thrive_tips_categories') order by t.tid`,
  );
  ctx.stats.source("tip_tags", terms.length);
  const seen = new Set<string>();
  const tagRows = [];
  for (const term of terms) {
    const kind = term.vocab === "thrive_tips_tags" ? ("tag" as const) : ("category" as const);
    let slug = slugify(term.name) || `term-${term.tid}`;
    if (seen.has(`${kind}:${slug}`)) slug = `${slug}-${term.tid}`;
    seen.add(`${kind}:${slug}`);
    tagRows.push({
      kind,
      name: term.name.trim(),
      slug,
      description: term.description ? toPlainText(term.description) || null : null,
      weight: Number(term.weight) || 0,
      ...legacy("lp", "taxonomy_term_data", term.tid),
    });
  }
  await upsertRows(ctx, "tip_tags", tipTags, tagRows, { target: [tipTags.kind, tipTags.slug] });
  const tagIds = new Map(
    (await ctx.db.select({ id: tipTags.id, legacyId: tipTags.legacyId }).from(tipTags).where(isNotNull(tipTags.legacyId))).map((t) => [
      t.legacyId!,
      t.id,
    ]),
  );
  const tagName = new Map(terms.map((t) => [Number(t.tid), t.name]));

  // ---- tips ----
  const tipNodes = await nodes(ctx, ctx.lp, ["thrive_tips"]);
  ctx.stats.source("tips", tipNodes.length);
  const fields = await loadFields(ctx.lp, "node", ["thrive_tips"], [
    "field_tip_type",
    "field_template",
    "field_html_content",
    "field_description",
    "field_pullquote",
    "field_video_link",
    "field_select_pdf_file",
    "field_link",
    "field_thrive_tags",
    "field_imbaaq_category",
    "field_hashtags",
    "field_display_day",
    "field_display_day_two",
    "field_user_field",
    "field_operator",
    "field_value",
  ]);
  const map = await userMap(ctx);
  const existing = new Map(
    (await ctx.db.select({ legacyId: tips.legacyId, extra: tips.extra, pdfKey: tips.pdfKey }).from(tips).where(isNotNull(tips.legacyId))).map(
      (t) => [t.legacyId!, t],
    ),
  );

  let images = 0;
  const rows = [];
  for (const node of tipNodes) {
    const id = node.nid;
    const rawHtml = str(fv(fields, id, "field_html_content")) ?? "";
    // Inline images were pasted as base64 data: URIs (151 tips). The sanitizer
    // drops data: URLs, so the images are stored as files and listed in extra.legacyImages.
    const found: { type: string; data: Buffer; alt?: string; width?: number; height?: number }[] = [];
    const withoutImages = rawHtml.replace(/<img\b[^>]*>/gi, (tag) => {
      const src = /src\s*=\s*"(data:([^;"]+);base64,([^"]+))"/i.exec(tag);
      if (!src) return tag;
      const get = (name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];
      found.push({
        type: src[2].toLowerCase() === "image/jpg" ? "image/jpeg" : src[2].toLowerCase(),
        data: Buffer.from(src[3], "base64"),
        alt: get("alt") || undefined,
        width: Number(get("width")) || undefined,
        height: Number(get("height")) || undefined,
      });
      return "";
    });
    const before = existing.get(id);
    let legacyImages = (before?.extra?.legacyImages as LegacyImage[] | undefined) ?? [];
    if (legacyImages.length !== found.length || legacyImages.some((img) => !storedKeyExists(img.key))) {
      const uploaded: LegacyImage[] = [];
      for (const image of found) {
        const result = await uploadBuffer(ctx, image.data, image.type, "tips/legacy");
        if (result) uploaded.push({ key: result.key, type: result.type, alt: image.alt, width: image.width, height: image.height });
      }
      if (uploaded.length === found.length) legacyImages = uploaded;
      else if (!legacyImages.length) legacyImages = [];
    } else {
      ctx.stats.source("files", found.length);
      ctx.stats.written("files", { inserted: 0, updated: 0, unchanged: found.length });
    }
    images += found.length;

    const html = sanitizeStaffHtml(withoutImages);
    const description = toPlainText(str(fv(fields, id, "field_description")) ?? "");
    const tipTagIds = fvAll(fields, id, "field_thrive_tags", "tid")
      .map((tid) => tagIds.get(Number(tid)))
      .filter((v): v is string => !!v);
    const categoryTid = int(fv(fields, id, "field_imbaaq_category", "tid"));
    const ruleField = str(fv(fields, id, "field_user_field"));
    const ruleOp = str(fv(fields, id, "field_operator"));
    const ruleValue = int(fv(fields, id, "field_value"));
    const rule =
      ruleField && ruleOp && ruleValue !== null && TAILORING_FIELDS.includes(ruleField) && (TAILORING_OPERATORS as readonly string[]).includes(ruleOp)
        ? { field: ruleField, operator: ruleOp as (typeof TAILORING_OPERATORS)[number], value: ruleValue }
        : null;
    const template = str(fv(fields, id, "field_template"));
    const day = int(fv(fields, id, "field_display_day"));
    const dayTwo = int(fv(fields, id, "field_display_day_two"));
    const hashtagTids = fvAll(fields, id, "field_hashtags", "tid").map(Number);
    const extra: Record<string, unknown> = {};
    if (legacyImages.length) extra.legacyImages = legacyImages;
    if (found.length && legacyImages.length !== found.length) extra.legacyImagesMissing = found.length;
    if (hashtagTids.length) extra.hashtagTids = hashtagTids;
    if (ruleField && !rule) extra.legacyRule = { field: ruleField, operator: ruleOp, value: ruleValue };
    if (day !== null && (day < 1 || day > 90)) extra.legacyDisplayDay = day;
    if (dayTwo !== null && (dayTwo < 1 || dayTwo > 90)) extra.legacyDisplayDayTwo = dayTwo;
    const pdfFid = int(fv(fields, id, "field_select_pdf_file", "fid"));
    if (pdfFid) extra.pdfFid = pdfFid;
    const tagNames = fvAll(fields, id, "field_thrive_tags", "tid").map((tid) => tagName.get(Number(tid)) ?? "");

    rows.push({
      title: node.title.trim() || `Tip ${id}`,
      type: TIP_TYPE[str(fv(fields, id, "field_tip_type")) ?? "Html"] ?? "html",
      template: (TIP_TEMPLATES as readonly string[]).includes(template ?? "") ? (template as (typeof TIP_TEMPLATES)[number]) : null,
      html,
      description,
      pullquote: str(fv(fields, id, "field_pullquote")) ? toPlainText(String(fv(fields, id, "field_pullquote"))) : null,
      videoUrl: str(fv(fields, id, "field_video_link", "video_url")),
      pdfKey: before?.pdfKey ?? null,
      link: str(fv(fields, id, "field_link")),
      tagIds: tipTagIds,
      categoryId: categoryTid ? tagIds.get(categoryTid) ?? null : null,
      displayDay: day !== null && day >= 1 && day <= 90 ? day : null,
      displayDayTwo: dayTwo !== null && dayTwo >= 1 && dayTwo <= 90 ? dayTwo : null,
      rule,
      published: node.status === 1,
      authorId: map.lp.get(node.uid) ?? null,
      searchText: [node.title, toPlainText(html), description, tagNames.join(" ")].join(" "),
      extra: Object.keys(extra).length ? extra : null,
      ...legacy("lp", "node", id),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  ctx.stats.note("tips", `${images} inline base64 images moved to storage (tips.extra.legacyImages); the tips schema has no image column`);
  await upsertRows(ctx, "tips", tips, rows);
  const tipIds = new Map(
    (await ctx.db.select({ id: tips.id, legacyId: tips.legacyId }).from(tips).where(isNotNull(tips.legacyId))).map((t) => [t.legacyId!, t.id]),
  );

  // ---- favourites: Flag `favourites` (fid 10), current state in `flagging` ----
  const favs = await q<{ flagging_id: number; entity_id: number; uid: number; timestamp: number }>(
    ctx.lp,
    "select g.flagging_id, g.entity_id, g.uid, g.timestamp from flagging g join flag f using (fid) where f.name = 'favourites' order by g.flagging_id",
  );
  ctx.stats.source("tip_favorites", favs.length);
  const favRows = [];
  for (const fav of favs) {
    const userId = map.lp.get(fav.uid);
    const tipId = tipIds.get(fav.entity_id);
    if (!userId) {
      ctx.stats.skip("tip_favorites", "user not migrated (deleted account)");
      continue;
    }
    if (!tipId) {
      ctx.stats.skip("tip_favorites", "tip deleted");
      continue;
    }
    favRows.push({ userId, tipId, createdAt: ts(fav.timestamp) ?? new Date(0), ...legacy("lp", "flagging", fav.flagging_id) });
  }
  await upsertRows(ctx, "tip_favorites", tipFavorites, favRows, { target: [tipFavorites.userId, tipFavorites.tipId] });

  // ---- views: user_tips_report (uid, nid, count, created) ----
  const views = await q<{ id: number; uid: number; nid: number; count: number; created: number }>(
    ctx.lp,
    "select id, uid, nid, count, created from user_tips_report order by id",
  );
  ctx.stats.source("tip_views", views.length);
  const viewRows = [];
  let deletedTipViews = 0;
  for (const view of views) {
    const userId = map.lp.get(view.uid);
    if (!userId) {
      ctx.stats.skip("tip_views", "user not migrated (deleted account)");
      continue;
    }
    // View history survives deleted tips (tip_views.tip_id has no FK): a gone
    // node gets a stable placeholder uuid derived from its nid.
    let tipId = tipIds.get(view.nid);
    if (!tipId) {
      tipId = legacyUuid("lp", "node", view.nid);
      deletedTipViews++;
    }
    const at = ts(view.created) ?? new Date(0);
    viewRows.push({
      userId,
      tipId,
      count: Math.max(0, Number(view.count) || 0),
      recommended: false,
      firstViewedAt: at,
      lastViewedAt: at,
      ...legacy("lp", "user_tips_report", view.id),
    });
  }
  if (deletedTipViews) ctx.stats.note("tip_views", `${deletedTipViews} views of deleted tips kept with a placeholder tip id (legacyUuid("lp","node",nid))`);
  await upsertRows(ctx, "tip_views", tipViews, viewRows, { target: [tipViews.userId, tipViews.tipId] });
}
