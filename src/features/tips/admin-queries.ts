import "server-only";
import { and, arrayContains, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { tipFavorites, tips, tipTags, tipViews, type TipType } from "@/server/db/schema";
import type { TipInput } from "./schemas";
import { describeRule } from "./tailoring";

/** Staff-side reads for /admin/content/tips. Callers check `content.manage`. */

export type AdminTipRow = {
  id: string;
  title: string;
  type: string;
  tags: string[];
  displayDay: number | null;
  displayDayTwo: number | null;
  rule: string | null;
  published: boolean;
  readers: number;
  views: number;
  favorites: number;
  updatedAt: string | null;
};

export type AdminTipFilter = { q?: string; type?: string; tag?: string; status?: string; sort?: string };

export async function adminTagOptions() {
  // Tips per tag: each tip's tag ids plus its category id (a tag listed twice counts twice, as before).
  const refs = db
    .$with("refs")
    .as(db.select({ id: sql<string | null>`unnest(array_append(${tips.tagIds}, ${tips.categoryId}))`.as("id") }).from(tips));
  const [tags, counts] = await Promise.all([
    db.select().from(tipTags).orderBy(asc(tipTags.kind), asc(tipTags.name), asc(tipTags.id)),
    db.with(refs).select({ id: refs.id, count: count() }).from(refs).where(isNotNull(refs.id)).groupBy(refs.id),
  ]);
  const byId = new Map(counts.map((c) => [c.id, c.count]));
  return tags.map((t) => ({
    id: t.id,
    kind: t.kind,
    name: t.name,
    slug: t.slug,
    description: t.description ?? "",
    count: byId.get(t.id) ?? 0,
  }));
}
export type AdminTagOption = Awaited<ReturnType<typeof adminTagOptions>>[number];

const TIP_TYPE_NAMES: readonly string[] = ["html", "video", "pdf", "offsite"];

export async function adminTipRows(filter: AdminTipFilter): Promise<AdminTipRow[]> {
  const conditions: SQL[] = [];
  if (filter.type && TIP_TYPE_NAMES.includes(filter.type)) conditions.push(eq(tips.type, filter.type as TipType));
  if (filter.status === "published") conditions.push(eq(tips.published, true));
  if (filter.status === "draft") conditions.push(eq(tips.published, false));
  if (filter.status === "tailored") conditions.push(isNotNull(tips.rule));
  if (filter.status === "unscheduled") conditions.push(isNull(tips.displayDay));
  if (filter.tag && isUuid(filter.tag)) {
    conditions.push(or(arrayContains(tips.tagIds, [filter.tag]), eq(tips.categoryId, filter.tag))!);
  }
  if (filter.q?.trim()) {
    const escaped = filter.q.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
    conditions.push(ilike(tips.title, `%${escaped}%`));
  }
  // Mongo put missing values first on ascending sorts; keep that.
  const order =
    filter.sort === "title"
      ? [asc(tips.title)]
      : filter.sort === "updated"
        ? [desc(tips.updatedAt)]
        : filter.sort === "day2"
          ? [sql`${tips.displayDayTwo} asc nulls first`, asc(tips.title)]
          : [sql`${tips.displayDay} asc nulls first`, asc(tips.title)];

  const [rows, tags, views, favorites] = await Promise.all([
    db
      .select({
        id: tips.id,
        title: tips.title,
        type: tips.type,
        tagIds: tips.tagIds,
        displayDay: tips.displayDay,
        displayDayTwo: tips.displayDayTwo,
        rule: tips.rule,
        published: tips.published,
        updatedAt: tips.updatedAt,
      })
      .from(tips)
      .where(and(...conditions))
      .orderBy(...order, asc(tips.id))
      .limit(1000),
    db.select({ id: tipTags.id, name: tipTags.name }).from(tipTags),
    db
      .select({
        tipId: tipViews.tipId,
        views: sql<number>`coalesce(sum(${tipViews.count}), 0)::int`,
        readers: count(),
      })
      .from(tipViews)
      .groupBy(tipViews.tipId),
    db.select({ tipId: tipFavorites.tipId, count: count() }).from(tipFavorites).groupBy(tipFavorites.tipId),
  ]);
  const tagNames = new Map(tags.map((t) => [t.id, t.name]));
  const viewMap = new Map(views.map((v) => [v.tipId, v]));
  const favMap = new Map(favorites.map((f) => [f.tipId, f.count]));
  return rows.map((tip) => {
    const id = tip.id;
    return {
      id,
      title: tip.title,
      type: tip.type,
      tags: tip.tagIds.map((t) => tagNames.get(t)).filter((n): n is string => Boolean(n)),
      displayDay: tip.displayDay ?? null,
      displayDayTwo: tip.displayDayTwo ?? null,
      rule: tip.rule ? describeRule(tip.rule) : null,
      published: tip.published,
      readers: viewMap.get(id)?.readers ?? 0,
      views: viewMap.get(id)?.views ?? 0,
      favorites: favMap.get(id) ?? 0,
      updatedAt: tip.updatedAt.toISOString(),
    };
  });
}

export async function adminTipStats() {
  const [row] = await db
    .select({
      total: count(),
      published: count(sql`case when ${tips.published} then 1 end`),
      tailored: count(tips.rule),
      unscheduled: count(sql`case when ${tips.displayDay} is null then 1 end`),
    })
    .from(tips);
  return {
    total: row?.total ?? 0,
    published: row?.published ?? 0,
    tailored: row?.tailored ?? 0,
    unscheduled: row?.unscheduled ?? 0,
  };
}

/** Form values for the editor. */
export async function tipForEdit(id: string): Promise<(TipInput & { id: string }) | null> {
  if (!isUuid(id)) return null;
  const [tip] = await db.select().from(tips).where(eq(tips.id, id)).limit(1);
  if (!tip) return null;
  return {
    id: tip.id,
    title: tip.title,
    type: tip.type,
    template: tip.template ?? null,
    html: tip.html ?? "",
    description: tip.description ?? "",
    pullquote: tip.pullquote ?? "",
    videoUrl: tip.videoUrl ?? "",
    link: tip.link ?? "",
    pdfKey: tip.pdfKey ?? null,
    pdfName: tip.pdfName ?? null,
    tagIds: tip.tagIds,
    categoryId: tip.categoryId ?? null,
    displayDay: tip.displayDay ?? null,
    displayDayTwo: tip.displayDayTwo ?? null,
    rule: tip.rule ? { field: tip.rule.field, operator: tip.rule.operator, value: tip.rule.value } : null,
    published: tip.published,
  };
}

/** Days 1–90 of each cycle with the tips scheduled on them. */
export async function tipSchedule() {
  const rows = await db
    .select({
      id: tips.id,
      title: tips.title,
      displayDay: tips.displayDay,
      displayDayTwo: tips.displayDayTwo,
      published: tips.published,
    })
    .from(tips)
    .orderBy(asc(tips.createdAt), asc(tips.id));
  const grid = (key: "displayDay" | "displayDayTwo") =>
    Array.from({ length: 90 }, (_, i) => ({
      day: i + 1,
      tips: rows.filter((t) => t[key] === i + 1).map((t) => ({ id: t.id, title: t.title, published: t.published })),
    }));
  return {
    cycleOne: grid("displayDay"),
    cycleTwo: grid("displayDayTwo"),
    unscheduled: rows.filter((t) => !t.displayDay).map((t) => ({ id: t.id, title: t.title })),
  };
}

export async function tipEngagement(id: string) {
  if (!isUuid(id)) return null;
  const [[views], [favorites]] = await Promise.all([
    db
      .select({
        readers: count(),
        views: sql<number>`coalesce(sum(${tipViews.count}), 0)::int`,
        recommended: count(sql`case when ${tipViews.recommended} then 1 end`),
      })
      .from(tipViews)
      .where(eq(tipViews.tipId, id)),
    db.select({ count: count() }).from(tipFavorites).where(eq(tipFavorites.tipId, id)),
  ]);
  return {
    readers: views?.readers ?? 0,
    views: views?.views ?? 0,
    recommended: views?.recommended ?? 0,
    favorites: favorites?.count ?? 0,
  };
}
