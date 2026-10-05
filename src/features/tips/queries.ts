import "server-only";
import { cache } from "react";
import { asc, desc, eq, sql } from "drizzle-orm";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { profiles, tipFavorites, tips as tipsTable, tipTags, type Tip } from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";
import { latestReleaseDay, studyClock, studyDayStart, type StudyClock } from "./schedule";
import { isRecommended, type TailoringScores } from "./tailoring";
import type { TipCardData, TipPage, TipTagData } from "./types";
import { videoEmbed } from "./video";

/**
 * Read side of Thrive Tips. Everything is computed per viewer: which tips
 * have been released to them (study day), which are recommended (tailoring
 * rule) and which they favourited. Spec: docs/legacy/02-checkin-and-tips.md §1.
 *
 * Other areas use `feedTips` (wall feed) and `searchTips` (site search).
 */

/** The tip columns cards need. */
export type LeanTip = Pick<
  Tip,
  | "id"
  | "title"
  | "type"
  | "template"
  | "html"
  | "description"
  | "pullquote"
  | "videoUrl"
  | "pdfKey"
  | "pdfName"
  | "link"
  | "tagIds"
  | "categoryId"
  | "displayDay"
  | "displayDayTwo"
  | "rule"
  | "createdAt"
>;

const CARD_FIELDS = {
  id: tipsTable.id,
  title: tipsTable.title,
  type: tipsTable.type,
  template: tipsTable.template,
  html: tipsTable.html,
  description: tipsTable.description,
  pullquote: tipsTable.pullquote,
  videoUrl: tipsTable.videoUrl,
  pdfKey: tipsTable.pdfKey,
  pdfName: tipsTable.pdfName,
  link: tipsTable.link,
  tagIds: tipsTable.tagIds,
  categoryId: tipsTable.categoryId,
  displayDay: tipsTable.displayDay,
  displayDayTwo: tipsTable.displayDayTwo,
  rule: tipsTable.rule,
  createdAt: tipsTable.createdAt,
};

export type TipContext = {
  viewer: Viewer;
  clock: StudyClock | null;
  /** Staff and others without a study start see every published tip. */
  preview: boolean;
  scores: TailoringScores | null;
  favorites: Set<string>;
  lastSeenAt: Date | null;
  canEarnPoints: boolean;
  now: Date;
};

/** Loads what we need to know about the viewer once per request. */
export const tipContext = cache(async (viewer: Viewer): Promise<TipContext> => {
  const now = new Date();
  const [[profile], favorites] = await Promise.all([
    db
      .select({
        interventionStartDate: profiles.interventionStartDate,
        lastTipsSeenAt: profiles.lastTipsSeenAt,
        extra: profiles.extra,
      })
      .from(profiles)
      .where(eq(profiles.userId, viewer.id))
      .limit(1),
    db.select({ tipId: tipFavorites.tipId }).from(tipFavorites).where(eq(tipFavorites.userId, viewer.id)),
  ]);
  const clock = studyClock(profile?.interventionStartDate ?? null, now, viewer.timezone);
  const canEarnPoints = can(viewer, "tips.earnPoints");
  const extra = (profile?.extra ?? null) as { tailoring?: TailoringScores } | null;
  return {
    viewer,
    clock,
    // Participants without a start date haven't begun; everyone else previews.
    preview: !clock && !canEarnPoints,
    scores: extra?.tailoring ?? null,
    favorites: new Set(favorites.map((f) => f.tipId)),
    lastSeenAt: profile?.lastTipsSeenAt ?? null,
    canEarnPoints,
    now,
  };
});

const allTags = cache(async () => {
  const tags = await db
    .select({ id: tipTags.id, name: tipTags.name, slug: tipTags.slug, kind: tipTags.kind })
    .from(tipTags)
    .orderBy(asc(tipTags.name), asc(tipTags.id));
  return new Map(tags.map((t) => [t.id, t]));
});

/** Every published tip (≈160 in production, so filtering in memory is fine). */
const publishedTips = cache(async (): Promise<LeanTip[]> => {
  // Mongo sorted a missing displayDay first; keep that order.
  return db
    .select(CARD_FIELDS)
    .from(tipsTable)
    .where(eq(tipsTable.published, true))
    .orderBy(sql`${tipsTable.displayDay} asc nulls first`, desc(tipsTable.createdAt), asc(tipsTable.id));
});

type Released = { tip: LeanTip; releaseDay: number | null; releasedAt: Date | null };

function releaseOf(tip: LeanTip, ctx: TipContext): Released | null {
  if (ctx.preview) return { tip, releaseDay: null, releasedAt: null };
  if (!ctx.clock) return null;
  const releaseDay = latestReleaseDay(tip, ctx.clock);
  if (releaseDay == null) return null;
  return { tip, releaseDay, releasedAt: studyDayStart(ctx.clock, releaseDay) };
}

function sortKey(r: Released) {
  return (r.releasedAt ?? r.tip.createdAt ?? new Date(0)).getTime();
}

/** Tips released to the viewer, newest release first. */
async function releasedTips(ctx: TipContext): Promise<Released[]> {
  const tips = await publishedTips();
  return tips
    .map((tip) => releaseOf(tip, ctx))
    .filter((r): r is Released => r !== null)
    .sort((a, b) => sortKey(b) - sortKey(a));
}

function excerptOf(tip: LeanTip) {
  // Keep a space between paragraphs/list items when flattening HTML.
  const text = toPlainText((tip.description || tip.html || "").replace(/</g, " <"));
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

function toCard(r: Released, ctx: TipContext, tags: Map<string, TipTagData & { kind: string }>): TipCardData {
  const { tip } = r;
  const id = tip.id;
  const video = tip.videoUrl ? videoEmbed(tip.videoUrl) : null;
  const tagList = (tip.tagIds ?? [])
    .map((tagId) => tags.get(tagId))
    .filter((t): t is TipTagData & { kind: string } => Boolean(t))
    .map(({ id, name, slug }) => ({ id, name, slug }));
  const category = tip.categoryId ? tags.get(tip.categoryId) : undefined;
  return {
    id,
    title: tip.title,
    type: tip.type,
    template: tip.template ?? null,
    html: tip.html ?? "",
    description: toPlainText(tip.description ?? ""),
    pullquote: tip.pullquote ?? null,
    video: tip.videoUrl ? { url: tip.videoUrl, embedUrl: video?.embedUrl ?? null, thumbnailUrl: video?.thumbnailUrl ?? null } : null,
    hasPdf: Boolean(tip.pdfKey),
    pdfName: tip.pdfName ?? null,
    link: tip.link ?? null,
    tags: tagList,
    category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
    recommended: isRecommended(tip.rule, ctx.scores),
    favorited: ctx.favorites.has(id),
    isNew: Boolean(r.releasedAt && ctx.canEarnPoints && (!ctx.lastSeenAt || r.releasedAt > ctx.lastSeenAt)),
    releasedAt: r.releasedAt?.toISOString() ?? null,
    studyDay: r.releaseDay,
    excerpt: excerptOf(tip),
    href: `/tips/${id}`,
    canEarnPoints: ctx.canEarnPoints && !ctx.preview,
  };
}

async function cards(ctx: TipContext, released: Released[]) {
  const tags = await allTags();
  return released.map((r) => toCard(r, ctx, tags));
}

/** The "Today" tab: today's tips first, then the rest of the last week. */
export async function tipsHome(viewer: Viewer) {
  const ctx = await tipContext(viewer);
  const released = await releasedTips(ctx);
  const clock = ctx.clock;
  // The carousel shows today's tips; on a day without new tips, the latest day's.
  const latestDay = released.find((r) => r.releaseDay != null)?.releaseDay ?? null;
  const featuredDay = clock && released.some((r) => r.releaseDay === clock.day) ? clock.day : latestDay;
  const featured = ctx.preview ? released.slice(0, 5) : released.filter((r) => r.releaseDay != null && r.releaseDay === featuredDay);
  const earlier = clock
    ? released.filter((r) => !featured.includes(r) && r.releaseDay != null && clock.day - r.releaseDay < 7)
    : [];
  const all = await cards(ctx, released);
  const byId = new Map(all.map((c) => [c.id, c]));
  const pick = (list: Released[]) => list.map((r) => byId.get(r.tip.id)!);
  return {
    clock: clock ? { day: clock.day, cycle: clock.cycle } : null,
    preview: ctx.preview,
    notStarted: !clock && !ctx.preview,
    /** True when the featured tips were released today. */
    featuredIsToday: Boolean(clock && featuredDay === clock.day),
    featured: pick(featured),
    earlier: pick(earlier),
    recommended: all.filter((c) => c.recommended).slice(0, 6),
    newCount: all.filter((c) => c.isNew).length,
    total: all.length,
    topTags: topTags(all, 8),
  };
}

function topTags(all: TipCardData[], limit: number) {
  const counts = new Map<string, { tag: TipTagData; count: number }>();
  for (const card of all) {
    for (const tag of card.tags) {
      const entry = counts.get(tag.id) ?? { tag, count: 0 };
      entry.count += 1;
      counts.set(tag.id, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name))
    .slice(0, limit)
    .map(({ tag, count }) => ({ ...tag, count }));
}

/** Explore: released tips, optionally filtered by any of the tags and/or "for you". */
export async function exploreTips(viewer: Viewer, filter: { tags?: string[]; forYou?: boolean }) {
  const ctx = await tipContext(viewer);
  const all = await cards(ctx, await releasedTips(ctx));
  const tagFacets = topTags(all, 200).sort((a, b) => a.name.localeCompare(b.name));
  const wanted = new Set((filter.tags ?? []).map((t) => t.toLowerCase()));
  const items = all.filter(
    (card) => (!wanted.size || card.tags.some((t) => wanted.has(t.slug))) && (!filter.forYou || card.recommended),
  );
  return {
    items,
    tags: tagFacets,
    recommendedCount: all.filter((c) => c.recommended).length,
    notStarted: !ctx.clock && !ctx.preview,
  };
}

/** Favourites, most recently favourited first. */
export async function favoriteTips(viewer: Viewer) {
  const ctx = await tipContext(viewer);
  const favs = await db
    .select({ tipId: tipFavorites.tipId })
    .from(tipFavorites)
    .where(eq(tipFavorites.userId, viewer.id))
    .orderBy(desc(tipFavorites.createdAt), desc(tipFavorites.id));
  const tips = await publishedTips();
  const byId = new Map(tips.map((t) => [t.id, t]));
  const released = favs
    .map((f) => byId.get(f.tipId))
    .filter((t): t is LeanTip => Boolean(t))
    .map((tip) => releaseOf(tip, ctx) ?? { tip, releaseDay: null, releasedAt: null });
  return cards(ctx, released);
}

/**
 * A single tip if the viewer may see it (published and released to them, or
 * staff preview), with a few related tips sharing a topic or category.
 */
export async function tipForViewer(viewer: Viewer, id: string) {
  if (!isUuid(id)) return null;
  const ctx = await tipContext(viewer);
  const released = await releasedTips(ctx);
  const index = released.findIndex((r) => r.tip.id === id);
  // Favourited tips stay reachable (e.g. from an older cycle).
  let entry = index >= 0 ? released[index] : null;
  if (!entry && ctx.favorites.has(id)) {
    const tip = (await publishedTips()).find((t) => t.id === id);
    if (tip) entry = { tip, releaseDay: null, releasedAt: null };
  }
  if (!entry) return null;

  const tagIds = new Set(entry.tip.tagIds ?? []);
  const category = entry.tip.categoryId ?? null;
  const related = released
    .filter((r) => r !== entry)
    .map((r) => ({
      r,
      score:
        (r.tip.tagIds ?? []).filter((t) => tagIds.has(t)).length * 2 +
        (category && r.tip.categoryId === category ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || sortKey(b.r) - sortKey(a.r))
    .slice(0, 4)
    .map((x) => x.r);

  const [card, ...relatedCards] = await cards(ctx, [entry, ...related]);
  return { tip: card, related: relatedCards, pdfKey: entry.tip.pdfKey ?? null, pdfName: entry.tip.pdfName ?? null };
}

/**
 * Wall feed contract: tips released to the viewer, newest release first,
 * released strictly before `before` (ISO date) when given. Each item's
 * `releasedAt` is when it should sit in the feed.
 */
export async function feedTips(viewer: Viewer, options: { limit: number; before?: string | Date }) {
  const ctx = await tipContext(viewer);
  if (ctx.preview) return { items: [] as TipCardData[], nextBefore: null as string | null };
  const before = options.before ? new Date(options.before) : null;
  const released = (await releasedTips(ctx)).filter(
    (r) => r.releasedAt && r.releasedAt <= ctx.now && (!before || r.releasedAt < before),
  );
  const page = released.slice(0, Math.max(0, Math.min(options.limit, 50)));
  const items = await cards(ctx, page);
  const last = page.at(-1)?.releasedAt;
  return { items, nextBefore: released.length > page.length && last ? last.toISOString() : null };
}

const SEARCH_PAGE_SIZE = 10;

/**
 * Site search contract: tips containing all the words (title, body,
 * description or tag names), released tips only for participants.
 */
export async function searchTips(viewer: Viewer, q: string, options: { page?: number } = {}): Promise<TipPage<TipCardData>> {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  if (!words.length) return { items: [], total: 0, page, pageCount: 0 };

  const ctx = await tipContext(viewer);
  const tags = await allTags();
  const released = await releasedTips(ctx);
  const matches = released.filter((r) => {
    const haystack = [
      r.tip.title,
      toPlainText(r.tip.html ?? ""),
      toPlainText(r.tip.description ?? ""),
      ...(r.tip.tagIds ?? []).map((t) => tags.get(t)?.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  const total = matches.length;
  const pageCount = Math.ceil(total / SEARCH_PAGE_SIZE);
  const slice = matches.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE);
  return { items: await cards(ctx, slice), total, page, pageCount };
}

/** "N new tips": releases since the viewer last opened Your Tips. */
export async function countNewTips(viewer: Viewer) {
  const ctx = await tipContext(viewer);
  if (!ctx.clock || !ctx.canEarnPoints) return 0;
  const released = await releasedTips(ctx);
  return released.filter((r) => r.releasedAt && (!ctx.lastSeenAt || r.releasedAt > ctx.lastSeenAt)).length;
}

/** Called after rendering Your Tips: everything released so far has been seen. */
export async function markTipsSeen(viewer: Viewer) {
  await db.update(profiles).set({ lastTipsSeenAt: new Date() }).where(eq(profiles.userId, viewer.id));
}

/** Release check used by actions: may this viewer interact with this tip? */
export async function releasedTipFor(viewer: Viewer, tipId: string) {
  if (!isUuid(tipId)) return null;
  const ctx = await tipContext(viewer);
  const tip = (await publishedTips()).find((t) => t.id === tipId);
  if (!tip) return null;
  const released = releaseOf(tip, ctx);
  return { tip, released: Boolean(released), recommended: isRecommended(tip.rule, ctx.scores), ctx };
}
