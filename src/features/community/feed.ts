import "server-only";
import { feedTips } from "@/features/tips/queries";
import type { TipCardData } from "@/features/tips/types";
import { can, type Viewer } from "@/server/auth/session";
import { logger } from "@/server/logger";
import { decodeCursor, getFeedPage, type FeedQuery } from "./queries";
import type { PostDTO } from "./types";

export type FeedItem = { type: "post"; post: PostDTO } | { type: "tip"; tip: TipCardData };
export type FeedResult = { items: FeedItem[]; nextCursor: string | null };

const MAX_TIPS_PER_PAGE = 6;

/**
 * One page of the wall with Thrive Tips woven in at the moment each tip was
 * released to the viewer (docs/legacy/03 §5.2.2, with the old date maths
 * fixed): a page covering posts from `upper` down to `lower` also shows the
 * tips released in that window. Tips never appear on profile or tag walls.
 */
export async function buildFeed(viewer: Viewer, query: FeedQuery & { withTips?: boolean }): Promise<FeedResult> {
  const page = await getFeedPage(viewer, query);
  const items: FeedItem[] = page.posts.map((post) => ({ type: "post", post }));
  if (!query.withTips || !can(viewer, "tips.view")) return { items, nextCursor: page.nextCursor };

  const upper = decodeCursor(query.cursor)?.createdAt ?? null;
  const lower = page.nextCursor ? (page.raw.at(-1)?.createdAt ?? null) : null;
  let tips: TipCardData[] = [];
  try {
    const result = await feedTips(viewer, { limit: MAX_TIPS_PER_PAGE, before: upper ?? undefined });
    tips = result.items.filter((tip) => tip.releasedAt && (!lower || new Date(tip.releasedAt) >= lower));
  } catch (error) {
    logger.warn({ userId: viewer.id, err: (error as Error).message }, "feed tips failed");
  }
  if (!tips.length) return { items, nextCursor: page.nextCursor };

  const merged: FeedItem[] = [...items, ...tips.map((tip) => ({ type: "tip" as const, tip }))];
  const at = (item: FeedItem) => new Date(item.type === "post" ? item.post.createdAt : item.tip.releasedAt!).getTime();
  merged.sort((a, b) => at(b) - at(a));
  return { items: merged, nextCursor: page.nextCursor };
}
