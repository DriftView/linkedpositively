import { glossaryTerms, journeyCategories, journeyGoals, journeyMethods, journeyUserGoals, levelCopy, pages } from "@/server/db/schema";
import { termLetter, termSlug } from "@/features/glossary/lib";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";
import { q, type Ctx } from "./lib/context";
import { fv, int, loadFields, localDateTime, phpUnserialize, slugify, str, ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Site content: information pages, glossary, journey content (categories →
 * methods → goals), level copy. Participants' own journey goals (`user_goals`)
 * are handled here too because they reference the journey content.
 */
export async function migrateContent(ctx: Ctx) {
  await migratePages(ctx);
  await migrateGlossary(ctx);
  await migrateJourney(ctx);
  await migrateLevelCopy(ctx);
}

type NodeRow = { nid: number; type: string; title: string; uid: number; status: number; created: number; changed: number };

export async function nodes(ctx: Ctx, pool: Ctx["lp"], types: string[]) {
  return q<NodeRow>(
    pool,
    `select nid, type, title, uid, status, created, changed from node where type in (${types.map(() => "?").join(",")}) order by nid`,
    types,
  );
}

// ---------------------------------------------------------------------------

/** Legacy test pages ("post", "test hash", "testpage") are kept as drafts. */
const TEST_PAGE = /^(post|test.*|testpage)$/i;

async function migratePages(ctx: Ctx) {
  const rows = await nodes(ctx, ctx.lp, ["page", "public_page"]);
  ctx.stats.source("pages", rows.length);
  const fields = await loadFields(ctx.lp, "node", ["page", "public_page"], ["body", "field_video_link"]);
  const aliases = await q<{ source: string; alias: string }>(ctx.lp, "select source, alias from url_alias where source like 'node/%'");
  const aliasOf = new Map<number, string[]>();
  for (const a of aliases) {
    const nid = Number(a.source.slice(5));
    (aliasOf.get(nid) ?? aliasOf.set(nid, []).get(nid)!).push(a.alias);
  }
  const taken = new Map((await ctx.db.select({ slug: pages.slug, legacyId: pages.legacyId }).from(pages)).map((p) => [p.slug, p.legacyId]));
  const out = [];
  for (const node of rows) {
    const nodeAliases = aliasOf.get(node.nid) ?? [];
    let slug = slugify(nodeAliases[0] ?? node.title) || `page-${node.nid}`;
    const owner = taken.get(slug);
    if (owner !== undefined && owner !== node.nid) slug = `${slug}-${node.nid}`;
    taken.set(slug, node.nid);
    const body = str(fv(fields, node.nid, "body")) ?? "";
    out.push({
      slug,
      title: node.title.trim() || `Page ${node.nid}`,
      summary: str(fv(fields, node.nid, "body", "summary")),
      bodyHtml: sanitizeStaffHtml(body),
      videoUrl: str(fv(fields, node.nid, "field_video_link", "video_url")),
      status: node.status === 1 && !TEST_PAGE.test(node.title.trim()) ? ("published" as const) : ("draft" as const),
      audience: node.type === "page" ? ("staff" as const) : ("everyone" as const),
      inMenu: false,
      order: 100 + out.length,
      needsReview: true,
      aliases: nodeAliases,
      ...legacy("lp", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  // Pages are edited by staff (and seeded with reviewed copy for the aliased ones): insert only, never overwrite.
  await upsertRows(ctx, "pages", pages, out, { insertOnly: true });
}

// ---------------------------------------------------------------------------

async function migrateGlossary(ctx: Ctx) {
  const terms = await q<{ tid: number; name: string; description: string | null; weight: number }>(
    ctx.lp,
    "select t.tid, t.name, t.description, t.weight from taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name = 'glossary_terms' order by t.tid",
  );
  ctx.stats.source("glossary_terms", terms.length);
  const seen = new Set<string>();
  const out = [];
  for (const term of terms) {
    let slug = termSlug(term.name);
    if (seen.has(slug)) slug = `${slug}-${term.tid}`;
    seen.add(slug);
    const html = sanitizeStaffHtml(term.description ?? "");
    out.push({
      name: term.name.trim(),
      slug,
      letter: termLetter(term.name),
      definitionHtml: html,
      definitionText: toPlainText(html),
      ...legacy("lp", "taxonomy_term_data", term.tid),
    });
  }
  // The starter glossary uses the same slugs: the study's own definitions replace it.
  await upsertRows(ctx, "glossary_terms", glossaryTerms, out, { target: [glossaryTerms.slug] });
}

// ---------------------------------------------------------------------------

async function migrateJourney(ctx: Ctx) {
  const categories = await nodes(ctx, ctx.lp, ["journey_category"]);
  const methods = await nodes(ctx, ctx.lp, ["journey_methods"]);
  const goals = await nodes(ctx, ctx.lp, ["journey_goals"]);
  const fields = await loadFields(ctx.lp, "node", ["journey_category", "journey_methods", "journey_goals"], [
    "field_journey_category_name",
    "field_journey_category",
    "field_journey_method_name",
    "field_journey_method",
    "field_journey_goal_name",
  ]);
  ctx.stats.source("journey_categories", categories.length);
  ctx.stats.source("journey_methods", methods.length);
  ctx.stats.source("journey_goals", goals.length);

  const catRows = categories.map((node, index) => ({
    name: str(fv(fields, node.nid, "field_journey_category_name")) ?? node.title,
    slug: slugify(str(fv(fields, node.nid, "field_journey_category_name")) ?? node.title) || `category-${node.nid}`,
    order: index + 1,
    published: node.status === 1,
    ...legacy("lp", "node", node.nid),
    createdAt: ts(node.created) ?? new Date(0),
  }));
  // Starter categories share slugs ("health"…): link them to the legacy node, keep their description/accent.
  await upsertRows(ctx, "journey_categories", journeyCategories, catRows, {
    target: [journeyCategories.slug],
    update: ["name", "legacySite", "legacyTable", "legacyId"],
  });
  const catIds = new Map(
    (await ctx.db.select({ id: journeyCategories.id, legacyId: journeyCategories.legacyId }).from(journeyCategories)).map((c) => [
      c.legacyId,
      c.id,
    ]),
  );

  const methodRows = [];
  for (const [index, node] of methods.entries()) {
    const categoryId = catIds.get(int(fv(fields, node.nid, "field_journey_category", "target_id")) ?? -1);
    if (!categoryId) {
      ctx.stats.skip("journey_methods", "category missing");
      continue;
    }
    methodRows.push({
      categoryId,
      name: str(fv(fields, node.nid, "field_journey_method_name")) ?? node.title,
      order: index + 1,
      ...legacy("lp", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "journey_methods", journeyMethods, methodRows);
  const methodIds = new Map(
    (await ctx.db.select({ id: journeyMethods.id, legacyId: journeyMethods.legacyId }).from(journeyMethods)).map((m) => [m.legacyId, m.id]),
  );

  const goalRows = [];
  for (const [index, node] of goals.entries()) {
    const methodId = methodIds.get(int(fv(fields, node.nid, "field_journey_method", "target_id")) ?? -1);
    if (!methodId) {
      ctx.stats.skip("journey_goals", "method missing");
      continue;
    }
    goalRows.push({
      methodId,
      name: str(fv(fields, node.nid, "field_journey_goal_name")) ?? node.title,
      order: index + 1,
      ...legacy("lp", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "journey_goals", journeyGoals, goalRows);

  // Participants' goals (node type user_goals). On the old site all of them were
  // reassigned to the anonymous user (uid 0) when their owners' accounts were
  // deleted (user_goals_reported only names deleted uids), so normally none has an owner.
  // journey_user_goals.goal_id has no FK: a goal whose catalog node is gone keeps
  // its copied names and gets goalId = null (category/method likewise, which are nullable FKs).
  const userGoals = await nodes(ctx, ctx.lp, ["user_goals"]);
  ctx.stats.source("journey_user_goals", userGoals.length);
  const ugFields = await loadFields(ctx.lp, "node", ["user_goals"], [
    "field_user_category_id", "field_user_goal_category_name", "field_user_method_id", "field_user_goal_method_name",
    "field_user_goal_id", "field_user_goal_name", "field_goal_end_date", "field_own_category", "field_own_goals",
    "field_goal_percentage", "field_goal_step", "field_goal_current_step_descript", "field_goal_next_step_description",
    "field_dismiss", "field_goal_in",
  ]);
  const reported = await q<{ nid: number; n: number }>(ctx.lp, "select nid, sum(count) n from user_goals_reported group by nid");
  const updates = new Map(reported.map((r) => [Number(r.nid), Number(r.n)]));
  const goalIds = new Map(
    (await ctx.db.select({ id: journeyGoals.id, legacyId: journeyGoals.legacyId }).from(journeyGoals)).map((g) => [g.legacyId, g.id]),
  );
  const { lp, timezone } = await userMap(ctx);
  const ugRows = [];
  let missingGoal = 0;
  for (const node of userGoals) {
    const userId = lp.get(node.uid);
    if (!userId) {
      ctx.stats.skip("journey_user_goals", node.uid === 0 ? "owner account deleted (node.uid = 0)" : "owner not migrated");
      continue;
    }
    const f = (field: string, column = "value") => fv(ugFields, node.nid, field, column);
    const goalNid = int(f("field_user_goal_id", "target_id"));
    const goalId = goalNid ? (goalIds.get(goalNid) ?? null) : null;
    if (goalNid && !goalId) missingGoal++;
    const step = Math.min(7, Math.max(1, int(/(d+)/.exec(String(f("field_goal_step") ?? ""))?.[1]) ?? 1));
    const pct = int(f("field_goal_percentage"));
    ugRows.push({
      userId,
      categoryId: catIds.get(int(f("field_user_category_id", "target_id")) ?? -1) ?? null,
      categoryName: str(f("field_user_goal_category_name")),
      methodId: methodIds.get(int(f("field_user_method_id", "target_id")) ?? -1) ?? null,
      methodName: str(f("field_user_goal_method_name")),
      goalId,
      goalName: str(f("field_user_goal_name")),
      ownCategory: str(f("field_own_category")),
      ownGoal: str(f("field_own_goals")),
      step,
      currentStepNote: str(f("field_goal_current_step_descript")),
      nextStepNote: str(f("field_goal_next_step_description")),
      goalIn: str(f("field_goal_in")),
      targetDate: localDateTime(f("field_goal_end_date"), timezone.get(userId) ?? "America/New_York"),
      percentage: pct !== null && pct >= 0 && pct <= 100 ? pct : null,
      dismissed: Number(f("field_dismiss")) === 1,
      completedAt: step === 7 ? ts(node.changed) : null,
      updateCount: updates.get(node.nid) ?? 0,
      ...legacy("lp", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  if (missingGoal) ctx.stats.note("journey_user_goals", `${missingGoal} goals point to a deleted catalog goal: kept with goalId null and the copied goal name`);
  await upsertRows(ctx, "journey_user_goals", journeyUserGoals, ugRows);
}

// ---------------------------------------------------------------------------

async function migrateLevelCopy(ctx: Ctx) {
  const rows = [];
  for (let level = 1; level <= 8; level++) {
    const vars = await q<{ name: string; value: Buffer }>(ctx.lp, "select name, value from variable where name in (?, ?)", [
      `level${level}-name`,
      `level${level}-desc`,
    ]);
    const get = (suffix: string) => {
      const row = vars.find((v) => v.name === `level${level}-${suffix}`);
      const value = row ? phpUnserialize(row.value) : null;
      return typeof value === "string" ? value : "";
    };
    if (!vars.length) continue;
    rows.push({ level, headline: toPlainText(get("name")), description: toPlainText(get("desc")), ...legacy("lp", "variable", level) });
  }
  ctx.stats.source("level_copy", rows.length);
  // Staff edit level copy (and the app ships reviewed defaults): insert only.
  await upsertRows(ctx, "level_copy", levelCopy, rows, { target: [levelCopy.level], insertOnly: true });
}
