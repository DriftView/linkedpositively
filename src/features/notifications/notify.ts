import "server-only";
import { like } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import { notifications, type NotificationKind } from "@/server/db/schema";
import { logger } from "@/server/logger";

export type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  text: string;
  dedupeKey: string;
  actorId?: string;
  excerpt?: string;
  reaction?: string;
  href?: string;
  createdAt?: Date;
};

/** Truncates user text for notification excerpts (the old site used 97 chars). */
export function excerpt(text: string, length = 97) {
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > length ? `${plain.slice(0, length).trimEnd()}…` : plain;
}

/**
 * Creates an in-app notification. Re-sending the same (user, dedupeKey) is a
 * no-op. Never notifies people about their own actions. Never throws.
 */
export async function notify(input: NotifyInput) {
  if (input.actorId && input.actorId === input.userId) return;
  try {
    await db
      .insert(notifications)
      .values({
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        kind: input.kind,
        text: input.text,
        excerpt: input.excerpt,
        reaction: input.reaction,
        href: input.href,
        actorId: input.actorId,
        createdAt: input.createdAt ?? new Date(),
      })
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] });
  } catch (error) {
    logger.error({ userId: input.userId, kind: input.kind, err: (error as Error).message }, "notify failed");
  }
}

/** Escapes `%`, `_` and `\` for a LIKE pattern. */
function likeEscape(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Removes notifications about something that no longer exists (e.g. a deleted comment). */
export async function retractNotifications(dedupeKeyPrefix: string, executor: Executor = db) {
  await executor.delete(notifications).where(like(notifications.dedupeKey, `${likeEscape(dedupeKeyPrefix)}%`));
}
