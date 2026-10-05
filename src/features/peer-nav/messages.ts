import "server-only";
import { and, arrayContains, asc, count, desc, eq, gt, inArray, ne, not, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { messages, messageThreadMembers, messageThreads, profiles } from "@/server/db/schema";
import { peopleById } from "./people";
import type { ThreadDetail, ThreadMessage, ThreadSummary } from "./types";

/**
 * Peer Navigation messages (participant ↔ assigned coach). Replaces the
 * privatemsg inbox, which addressed every message to its own sender.
 */

/** A thread as seen by one member: the thread plus that member's read/delete markers. */
type ThreadRow = {
  id: string;
  participantId: string;
  coachId: string;
  subject: string;
  lastMessageAt: Date;
  lastReadAt: Date | null;
  deletedAt: Date | null;
};

const EPOCH = new Date(0);

const threadColumns = {
  id: messageThreads.id,
  participantId: messageThreads.participantId,
  coachId: messageThreads.coachId,
  subject: messageThreads.subject,
  lastMessageAt: messageThreads.lastMessageAt,
  lastReadAt: messageThreadMembers.lastReadAt,
  deletedAt: messageThreadMembers.deletedAt,
};

/** Join condition for `userId`'s membership row of the thread (inner join = only their threads). */
function memberOn(threadId: typeof messageThreads.id | typeof messages.threadId, userId: string) {
  return and(eq(messageThreadMembers.threadId, threadId), eq(messageThreadMembers.userId, userId));
}

/** Messages older than this are hidden for the member (they deleted the thread). */
function hiddenBefore(thread: ThreadRow) {
  return thread.deletedAt ?? EPOCH;
}

/** Thread is visible to the member if it has any message after their delete marker. */
function visibleTo(thread: ThreadRow) {
  return thread.lastMessageAt > hiddenBefore(thread);
}

/** Not deleted by `userId` for themself. */
function notDeletedFor(userId: string) {
  return not(arrayContains(messages.deletedFor, [userId]));
}

/**
 * Unread message counts per thread for a user: messages by others after the
 * member's last read / delete marker. `threadIds` limits the threads (all of
 * the user's threads when omitted).
 */
async function unreadRows(userId: string, threadIds?: string[]) {
  if (threadIds && !threadIds.length) return [];
  return db
    .select({ threadId: messages.threadId, participantId: messageThreads.participantId, n: count() })
    .from(messages)
    .innerJoin(messageThreads, eq(messageThreads.id, messages.threadId))
    .innerJoin(messageThreadMembers, memberOn(messages.threadId, userId))
    .where(
      and(
        threadIds ? inArray(messages.threadId, threadIds) : undefined,
        gt(
          messages.createdAt,
          sql`coalesce(greatest(${messageThreadMembers.lastReadAt}, ${messageThreadMembers.deletedAt}), 'epoch'::timestamptz)`,
        ),
        ne(messages.authorId, userId),
        notDeletedFor(userId),
      ),
    )
    .groupBy(messages.threadId, messageThreads.participantId);
}

async function unreadByThread(userId: string, threads: ThreadRow[]) {
  const candidates = threads.filter((thread) => {
    const since = [thread.lastReadAt, thread.deletedAt].filter((d): d is Date => Boolean(d)).sort((a, b) => +b - +a)[0] ?? EPOCH;
    return thread.lastMessageAt > since;
  });
  const rows = await unreadRows(
    userId,
    candidates.map((t) => t.id),
  );
  return new Map(rows.map((row) => [row.threadId, row.n]));
}

/** Total unread messages for the bell/badge. */
export async function countUnread(userId: string) {
  let total = 0;
  for (const row of await unreadRows(userId)) total += row.n;
  return total;
}

/** Unread counts keyed by participant id, for a coach's participant list. */
export async function unreadByParticipant(coachId: string) {
  const out = new Map<string, number>();
  for (const row of await unreadRows(coachId)) {
    if (row.n) out.set(row.participantId, (out.get(row.participantId) ?? 0) + row.n);
  }
  return out;
}

/** Whether the pair still works together (replies are only possible then). */
async function currentPairs(threads: ThreadRow[]) {
  const participantIds = [...new Set(threads.map((t) => t.participantId))];
  const rows = participantIds.length
    ? await db.select({ userId: profiles.userId, coachId: profiles.coachId }).from(profiles).where(inArray(profiles.userId, participantIds))
    : [];
  const coachOf = new Map(rows.map((p) => [p.userId, p.coachId]));
  return (thread: ThreadRow) => coachOf.get(thread.participantId) === thread.coachId;
}

/** The newest message of each thread that the member can still see. */
async function lastVisibleMessages(threads: ThreadRow[], userId: string) {
  const out = new Map<string, { body: string; authorId: string }>();
  if (!threads.length) return out;
  const rows = await db
    .selectDistinctOn([messages.threadId], { threadId: messages.threadId, body: messages.body, authorId: messages.authorId })
    .from(messages)
    .innerJoin(messageThreadMembers, memberOn(messages.threadId, userId))
    .where(
      and(
        inArray(
          messages.threadId,
          threads.map((t) => t.id),
        ),
        gt(messages.createdAt, sql`coalesce(${messageThreadMembers.deletedAt}, 'epoch'::timestamptz)`),
        notDeletedFor(userId),
      ),
    )
    .orderBy(messages.threadId, desc(messages.createdAt), desc(messages.id));
  for (const row of rows) out.set(row.threadId, { body: row.body, authorId: row.authorId });
  return out;
}

async function summarize(threads: ThreadRow[], userId: string): Promise<ThreadSummary[]> {
  const [unread, isCurrent, lasts, people] = await Promise.all([
    unreadByThread(userId, threads),
    currentPairs(threads),
    lastVisibleMessages(threads, userId),
    peopleById(threads.flatMap((t) => [t.participantId, t.coachId])),
  ]);
  return threads.map((thread) => {
    const otherId = thread.participantId === userId ? thread.coachId : thread.participantId;
    const last = lasts.get(thread.id);
    return {
      id: thread.id,
      subject: thread.subject || "Conversation",
      other: people.get(otherId) ?? null,
      participantId: thread.participantId,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      preview: last?.body.replace(/\s+/g, " ").slice(0, 140) ?? "",
      lastFromMe: last?.authorId === userId,
      unread: unread.get(thread.id) ?? 0,
      canReply: isCurrent(thread),
    };
  });
}

/** The user's conversations, newest first. `participantId` narrows a coach's inbox to one participant. */
export async function listThreads(userId: string, options: { participantId?: string } = {}) {
  if (options.participantId && !isUuid(options.participantId)) return [];
  const threads = await db
    .select(threadColumns)
    .from(messageThreads)
    .innerJoin(messageThreadMembers, memberOn(messageThreads.id, userId))
    .where(options.participantId ? eq(messageThreads.participantId, options.participantId) : undefined)
    .orderBy(desc(messageThreads.lastMessageAt), desc(messageThreads.id))
    .limit(200);
  return summarize(threads.filter(visibleTo), userId);
}

/** One conversation with its messages, if the user is a member. */
export async function getThread(userId: string, threadId: string): Promise<ThreadDetail | null> {
  if (!isUuid(threadId)) return null;
  const [thread] = await db
    .select(threadColumns)
    .from(messageThreads)
    .innerJoin(messageThreadMembers, memberOn(messageThreads.id, userId))
    .where(eq(messageThreads.id, threadId))
    .limit(1);
  if (!thread || !visibleTo(thread)) return null;
  const [summary] = await summarize([thread], userId);
  const rows = await db
    .select({ id: messages.id, body: messages.body, authorId: messages.authorId, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.threadId, thread.id), gt(messages.createdAt, hiddenBefore(thread)), notDeletedFor(userId)))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(500);
  const people = await peopleById(rows.map((m) => m.authorId));
  const readUntil = thread.lastReadAt ?? EPOCH;
  const items: ThreadMessage[] = rows.map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    author: people.get(message.authorId) ?? null,
    mine: message.authorId === userId,
    unread: message.authorId !== userId && message.createdAt > readUntil,
  }));
  return { ...summary, messages: items };
}
