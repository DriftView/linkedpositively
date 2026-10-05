import "server-only";
import { and, count, desc, eq, gt, lt, or } from "drizzle-orm";
import { getAuthors } from "@/features/community/queries";
import type { Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { notifications, profiles, type Notification } from "@/server/db/schema";
import type { NotificationDTO } from "./components/types";
import { lastNotificationsSeen, visibleFilter } from "./unread";

type NotificationRow = Pick<Notification, "id" | "kind" | "actorId" | "text" | "excerpt" | "reaction" | "href" | "createdAt">;

const columns = {
  id: notifications.id,
  kind: notifications.kind,
  actorId: notifications.actorId,
  text: notifications.text,
  excerpt: notifications.excerpt,
  reaction: notifications.reaction,
  href: notifications.href,
  createdAt: notifications.createdAt,
};

async function toDtos(rows: NotificationRow[], seen: Date | null): Promise<NotificationDTO[]> {
  const author = await getAuthors(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    excerpt: row.excerpt ?? null,
    reaction: row.reaction ?? null,
    href: row.href ?? null,
    createdAt: row.createdAt.toISOString(),
    isNew: !seen || row.createdAt > seen,
    actor: row.actorId ? author(row.actorId) : null,
  }));
}

const PAGE = 20;

/** The notification centre, newest first. Cursor = "<ms>_<id>". */
export async function listNotifications(viewer: Viewer, options: { cursor?: string | null; seen?: Date | null } = {}) {
  const [ms, id] = (options.cursor ?? "").split("_");
  let after = undefined;
  if (ms && id && isUuid(id) && /^\d+$/.test(ms)) {
    const at = new Date(Number(ms));
    after = or(lt(notifications.createdAt, at), and(eq(notifications.createdAt, at), lt(notifications.id, id)));
  }
  const rows = await db
    .select(columns)
    .from(notifications)
    .where(and(visibleFilter(viewer.id), after))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const seen = options.seen !== undefined ? options.seen : await lastNotificationsSeen(viewer.id);
  const last = page.at(-1);
  return {
    items: await toDtos(page, seen),
    nextCursor: rows.length > PAGE && last ? `${last.createdAt.getTime()}_${last.id}` : null,
  };
}

/** "In App Message" cards for the home page: what arrived since the notification centre was last opened. */
export async function homeMessages(viewer: Viewer, limit = 3) {
  const seen = await lastNotificationsSeen(viewer.id);
  const where = and(visibleFilter(viewer.id), seen ? gt(notifications.createdAt, seen) : undefined);
  const [rows, [total]] = await Promise.all([
    db
      .select(columns)
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit),
    db.select({ n: count() }).from(notifications).where(where),
  ]);
  return { items: await toDtos(rows, seen), total: total?.n ?? 0 };
}

/** Marks everything as seen (the bell count resets). */
export async function markNotificationsSeen(userId: string) {
  const now = new Date();
  await db
    .insert(profiles)
    .values({ userId, lastNotificationsSeenAt: now })
    .onConflictDoUpdate({ target: profiles.userId, set: { lastNotificationsSeenAt: now } });
}
