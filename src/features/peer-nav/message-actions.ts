"use server";

import { and, arrayContains, eq, not, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { excerpt, notify } from "@/features/notifications/notify";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { can, type Viewer } from "@/server/auth/session";
import { db, withTransaction } from "@/server/db/client";
import { messages, messageThreadMembers, messageThreads, users } from "@/server/db/schema";
import { coachIdOf, isPnParticipant } from "./access";
import { idSchema, replySchema, startThreadSchema } from "./schemas";

/**
 * Messages between a participant and their assigned coach. The old inbox
 * sent every message to its own author; here the participant's messages go to
 * their coach and the coach's to the participant.
 */

/** The viewer's membership row of a thread. */
function memberWhere(threadId: string, userId: string) {
  return and(eq(messageThreadMembers.threadId, threadId), eq(messageThreadMembers.userId, userId));
}

/** The thread, if `userId` is a member. */
async function memberThread(threadId: string, userId: string) {
  const [thread] = await db
    .select({ id: messageThreads.id, participantId: messageThreads.participantId, coachId: messageThreads.coachId })
    .from(messageThreads)
    .innerJoin(messageThreadMembers, and(eq(messageThreadMembers.threadId, messageThreads.id), eq(messageThreadMembers.userId, userId)))
    .where(eq(messageThreads.id, threadId))
    .limit(1);
  return thread ?? null;
}

function hrefFor(userId: string, participantId: string, threadId: string) {
  return userId === participantId ? `/coaching/messages/${threadId}` : `/coach/messages/${threadId}`;
}

function revalidateMessages(participantId: string) {
  revalidatePath("/coaching/messages", "layout");
  revalidatePath("/coach/messages", "layout");
  revalidatePath(`/coach/${participantId}/messages`);
}

async function notifyRecipient(viewer: Viewer, recipientId: string, participantId: string, threadId: string, messageId: string, body: string) {
  await notify({
    userId: recipientId,
    kind: "message",
    text: `${viewer.name} sent you a message.`,
    excerpt: excerpt(body),
    dedupeKey: `pn-message:${messageId}`,
    actorId: viewer.id,
    href: hrefFor(recipientId, participantId, threadId),
  });
}

/** Resolves who a new conversation is between, enforcing the participant ↔ own coach rule. */
async function resolvePair(viewer: Viewer, participantId?: string) {
  const isParticipantSide = can(viewer, "peernav.participant") && (!participantId || participantId === viewer.id);
  if (isParticipantSide) {
    const coachId = await coachIdOf(viewer.id);
    if (!coachId) throw new UserFacingError("You'll be able to send messages once you're matched with a peer navigator.");
    return { participantId: viewer.id, coachId, recipientId: coachId };
  }
  if (!participantId || !can(viewer, "peernav.coach")) throw new UserFacingError("Choose who to message.");
  const [[user], coachId] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.id, participantId)).limit(1),
    coachIdOf(participantId),
  ]);
  if (!user || !isPnParticipant(user.role) || coachId !== viewer.id) {
    throw new UserFacingError("You can message only the participants assigned to you.");
  }
  return { participantId, coachId: viewer.id, recipientId: participantId };
}

export const startThread = permissionAction("peernav.messages")
  .inputSchema(startThreadSchema)
  .action(async ({ parsedInput: input, ctx: { viewer } }) => {
    const pair = await resolvePair(viewer, input.participantId);
    const now = new Date();
    const { threadId, messageId } = await withTransaction(async (tx) => {
      const [thread] = await tx
        .insert(messageThreads)
        .values({
          participantId: pair.participantId,
          coachId: pair.coachId,
          subject: input.subject || "",
          createdBy: viewer.id,
          lastMessageAt: now,
          lastAuthorId: viewer.id,
        })
        .returning({ id: messageThreads.id });
      await tx.insert(messageThreadMembers).values([
        { threadId: thread.id, userId: viewer.id, lastReadAt: now },
        { threadId: thread.id, userId: pair.recipientId, lastReadAt: null },
      ]);
      const [message] = await tx
        .insert(messages)
        .values({ threadId: thread.id, authorId: viewer.id, body: input.body, createdAt: now })
        .returning({ id: messages.id });
      return { threadId: thread.id, messageId: message.id };
    });
    await notifyRecipient(viewer, pair.recipientId, pair.participantId, threadId, messageId, input.body);
    revalidateMessages(pair.participantId);
    return { threadId };
  });

export const replyToThread = permissionAction("peernav.messages")
  .inputSchema(replySchema)
  .action(async ({ parsedInput: { threadId, body }, ctx: { viewer } }) => {
    const thread = await memberThread(threadId, viewer.id);
    if (!thread) throw new UserFacingError("That conversation isn't available.");
    const participantId = thread.participantId;
    if ((await coachIdOf(participantId)) !== thread.coachId) {
      throw new UserFacingError("This conversation is closed because the participant has a different peer navigator now.");
    }
    const now = new Date();
    const message = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(messages)
        .values({ threadId: thread.id, authorId: viewer.id, body, createdAt: now })
        .returning({ id: messages.id });
      await tx.update(messageThreads).set({ lastMessageAt: now, lastAuthorId: viewer.id }).where(eq(messageThreads.id, thread.id));
      await tx.update(messageThreadMembers).set({ lastReadAt: now }).where(memberWhere(thread.id, viewer.id));
      return created;
    });
    const recipientId = participantId === viewer.id ? thread.coachId : participantId;
    await notifyRecipient(viewer, recipientId, participantId, threadId, message.id, body);
    revalidateMessages(participantId);
    return {
      message: {
        id: message.id,
        body,
        createdAt: now.toISOString(),
        author: { id: viewer.id, name: viewer.name, username: viewer.username },
        mine: true,
        unread: false,
      },
    };
  });

export const markThreadRead = permissionAction("peernav.messages")
  .inputSchema(idSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const [updated] = await db
      .update(messageThreadMembers)
      .set({ lastReadAt: new Date() })
      .from(messageThreads)
      .where(and(memberWhere(id, viewer.id), eq(messageThreads.id, messageThreadMembers.threadId)))
      .returning({ participantId: messageThreads.participantId });
    if (updated) revalidateMessages(updated.participantId);
    return { ok: true };
  });

/** Hides one message for the viewer only (replaces the GET /delete-message link). */
export const deleteMessageForMe = permissionAction("peernav.messages")
  .inputSchema(idSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const [message] = await db.select({ threadId: messages.threadId }).from(messages).where(eq(messages.id, id)).limit(1);
    if (!message) throw new UserFacingError("That message was already removed.");
    const thread = await memberThread(message.threadId, viewer.id);
    if (!thread) throw new UserFacingError("That conversation isn't available.");
    await db
      .update(messages)
      .set({ deletedFor: sql`array_append(${messages.deletedFor}, ${viewer.id}::uuid)` })
      .where(and(eq(messages.id, id), not(arrayContains(messages.deletedFor, [viewer.id]))));
    revalidateMessages(thread.participantId);
    return { ok: true };
  });

/** Hides a whole conversation for the viewer; a new message brings it back. */
export const deleteThreadForMe = permissionAction("peernav.messages")
  .inputSchema(idSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const now = new Date();
    const [thread] = await db
      .update(messageThreadMembers)
      .set({ deletedAt: now, lastReadAt: now })
      .from(messageThreads)
      .where(and(memberWhere(id, viewer.id), eq(messageThreads.id, messageThreadMembers.threadId)))
      .returning({ participantId: messageThreads.participantId });
    if (!thread) throw new UserFacingError("That conversation isn't available.");
    revalidateMessages(thread.participantId);
    return { ok: true };
  });
