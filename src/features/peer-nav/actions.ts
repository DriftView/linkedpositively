"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notify } from "@/features/notifications/notify";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { parseRoles } from "@/server/auth/roles";
import { can } from "@/server/auth/session";
import { db, withTransaction } from "@/server/db/client";
import { pnCoachAssignments, pnFiles, pnNotes, pnSessionRevisions, pnSessions, profiles, users } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { deleteFile } from "@/server/services/storage";
import { assertParticipantAccess, fileSpaceAccess, isPnParticipant, PN_COACH_ROLE } from "./access";
import { normalizeAnswers } from "./answers";
import { getCurriculumSession } from "./curriculum";
import { getRevisionAnswers } from "./queries";
import {
  assignCoachSchema,
  createNoteSchema,
  idSchema,
  participantDetailsSchema,
  reorderSchema,
  rowId,
  saveSessionSchema,
  startSessionSchema,
  updateNoteSchema,
} from "./schemas";

function revalidateParticipant(participantId: string) {
  revalidatePath(`/coach/${participantId}`, "layout");
  revalidatePath("/coach");
  revalidatePath("/coaching");
}

/** The (participant, serial) row of `pnSessions`. */
function sessionWhere(participantId: string, serial: number) {
  return and(eq(pnSessions.participantId, participantId), eq(pnSessions.serial, serial));
}

/* ------------------------------------------------------------------ */
/* Participant details                                                 */
/* ------------------------------------------------------------------ */

/** "Edit participant". The login username is deliberately not editable here. */
export const updateParticipantDetails = permissionAction("peernav.editParticipant")
  .inputSchema(participantDetailsSchema)
  .action(async ({ parsedInput: input, ctx: { viewer } }) => {
    await assertParticipantAccess(viewer, input.participantId);
    const userId = input.participantId;
    // Cleared fields are stored as null (the Mongo version unset them).
    const fields = {
      pronouns: input.pronouns ?? null,
      location: input.location ?? null,
      age: input.age ?? null,
      onPrep: input.onPrep ?? null,
      studyId: input.studyId ?? null,
      participantCode: input.participantCode ?? null,
    };
    await withTransaction(async (tx) => {
      await tx.update(users).set({ name: input.name, updatedAt: new Date() }).where(eq(users.id, userId));
      await tx
        .insert(profiles)
        .values({ userId, ...fields })
        .onConflictDoUpdate({ target: profiles.userId, set: fields });
    });
    revalidateParticipant(input.participantId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** Saves the coach's drag-and-drop order; the participant's plan follows it. */
export const reorderSessions = permissionAction("peernav.coach")
  .inputSchema(reorderSchema)
  .action(async ({ parsedInput: { participantId, order }, ctx: { viewer } }) => {
    await assertParticipantAccess(viewer, participantId);
    await db
      .insert(pnSessions)
      .values(
        order.map((serial, index) => ({
          participantId,
          serial,
          order: index + 1,
          status: "not_started" as const,
          createdBy: viewer.id,
          updatedBy: viewer.id,
        })),
      )
      .onConflictDoUpdate({
        target: [pnSessions.participantId, pnSessions.serial],
        set: { order: sql`excluded.${sql.identifier("order")}`, updatedBy: viewer.id, updatedAt: new Date() },
      });
    revalidateParticipant(participantId);
    return { ok: true };
  });

/** "Start": marks the session as in progress (no longer done as a side effect of opening the page). */
export const startSession = permissionAction("peernav.coach")
  .inputSchema(startSessionSchema)
  .action(async ({ parsedInput: { participantId, serial }, ctx: { viewer } }) => {
    await assertParticipantAccess(viewer, participantId);
    const now = new Date();
    await withTransaction(async (tx) => {
      await tx
        .insert(pnSessions)
        .values({ participantId, serial, order: serial, createdBy: viewer.id, status: "not_started" })
        .onConflictDoNothing({ target: [pnSessions.participantId, pnSessions.serial] });
      await tx
        .update(pnSessions)
        .set({ startedAt: now, lastActivityAt: now, updatedBy: viewer.id })
        .where(and(sessionWhere(participantId, serial), isNull(pnSessions.startedAt)));
      await tx
        .update(pnSessions)
        .set({ status: "in_progress" })
        .where(and(sessionWhere(participantId, serial), eq(pnSessions.status, "not_started")));
    });
    revalidateParticipant(participantId);
    return { ok: true };
  });

/**
 * Save of the session checklist: always a new immutable revision. Completion
 * can be undone (the old form could only set it). A note is created only
 * when text was written, and records its coach.
 */
export const saveSession = permissionAction("peernav.coach")
  .inputSchema(saveSessionSchema)
  .action(async ({ parsedInput: input, ctx: { viewer } }) => {
    await assertParticipantAccess(viewer, input.participantId);
    const curriculum = getCurriculumSession(input.serial);
    if (!curriculum) throw new UserFacingError("That session doesn't exist.");
    const answers = normalizeAnswers(curriculum, input.answers);
    const now = new Date();
    const participantId = input.participantId;
    const coachId = viewer.id;

    const result = await withTransaction(async (tx) => {
      const [existing] = await tx
        .select({ status: pnSessions.status, completedAt: pnSessions.completedAt, startedAt: pnSessions.startedAt })
        .from(pnSessions)
        .where(sessionWhere(participantId, input.serial))
        .limit(1)
        .for("update");
      const wasComplete = existing?.status === "complete";
      const completedAt = input.complete ? (wasComplete ? (existing?.completedAt ?? now) : now) : null;
      const fields = {
        status: input.complete ? ("complete" as const) : ("in_progress" as const),
        completedAt,
        lastActivityAt: now,
        updatedBy: coachId,
        ...(existing?.startedAt ? {} : { startedAt: now }),
      };
      const [session] = await tx
        .insert(pnSessions)
        .values({ participantId, serial: input.serial, order: input.serial, createdBy: coachId, ...fields })
        .onConflictDoUpdate({ target: [pnSessions.participantId, pnSessions.serial], set: { ...fields, updatedAt: now } })
        .returning({ id: pnSessions.id });
      const [revision] = await tx
        .insert(pnSessionRevisions)
        .values({ sessionId: session.id, participantId, serial: input.serial, coachId, answers, complete: input.complete, createdAt: now })
        .returning({ id: pnSessionRevisions.id });
      let noteId: string | null = null;
      if (input.note?.text) {
        const [note] = await tx
          .insert(pnNotes)
          .values({
            participantId,
            authorId: coachId,
            sessionSerial: input.serial,
            sessionId: session.id,
            revisionId: revision.id,
            text: input.note.text,
            methodOfContact: input.note.method,
          })
          .returning({ id: pnNotes.id });
        noteId = note.id;
      }
      return { revisionId: revision.id, completedAt, noteId };
    });

    revalidateParticipant(input.participantId);
    revalidatePath("/admin/reports/sessions");
    return {
      revisionId: result.revisionId,
      savedAt: now.toISOString(),
      status: input.complete ? ("complete" as const) : ("in_progress" as const),
      completedAt: result.completedAt ? result.completedAt.toISOString() : null,
      noteCreated: Boolean(result.noteId),
    };
  });

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export const createNote = permissionAction("peernav.coach")
  .inputSchema(createNoteSchema)
  .action(async ({ parsedInput: input, ctx: { viewer } }) => {
    await assertParticipantAccess(viewer, input.participantId);
    const [note] = await db
      .insert(pnNotes)
      .values({
        participantId: input.participantId,
        authorId: viewer.id,
        sessionSerial: input.sessionSerial,
        text: input.text,
        methodOfContact: input.method,
      })
      .returning({ id: pnNotes.id });
    revalidateParticipant(input.participantId);
    return { id: note.id };
  });

async function ownNote(noteId: string, viewerId: string) {
  const [note] = await db
    .select({ id: pnNotes.id, participantId: pnNotes.participantId, authorId: pnNotes.authorId })
    .from(pnNotes)
    .where(and(eq(pnNotes.id, noteId), isNull(pnNotes.deletedAt)))
    .limit(1);
  if (!note) throw new UserFacingError("That note no longer exists.");
  if (!note.authorId || note.authorId !== viewerId) throw new UserFacingError("You can only change notes you wrote.");
  return note;
}

export const updateNote = permissionAction("peernav.coach")
  .inputSchema(updateNoteSchema)
  .action(async ({ parsedInput: input, ctx: { viewer } }) => {
    const note = await ownNote(input.noteId, viewer.id);
    await assertParticipantAccess(viewer, note.participantId);
    await db
      .update(pnNotes)
      .set({ text: input.text, methodOfContact: input.method, sessionSerial: input.sessionSerial })
      .where(eq(pnNotes.id, note.id));
    revalidateParticipant(note.participantId);
    return { ok: true };
  });

export const deleteNote = permissionAction("peernav.coach")
  .inputSchema(idSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const note = await ownNote(id, viewer.id);
    await assertParticipantAccess(viewer, note.participantId);
    await db.update(pnNotes).set({ deletedAt: new Date() }).where(eq(pnNotes.id, note.id));
    revalidateParticipant(note.participantId);
    return { ok: true };
  });

/** Undo for a deleted note (the toast's "Undo"). */
export const restoreNote = permissionAction("peernav.coach")
  .inputSchema(idSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const [note] = await db
      .select({ id: pnNotes.id, participantId: pnNotes.participantId })
      .from(pnNotes)
      .where(and(eq(pnNotes.id, id), eq(pnNotes.authorId, viewer.id)))
      .limit(1);
    if (!note) throw new UserFacingError("That note can't be restored.");
    await assertParticipantAccess(viewer, note.participantId);
    await db.update(pnNotes).set({ deletedAt: null }).where(eq(pnNotes.id, note.id));
    revalidateParticipant(note.participantId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

/**
 * Removes a file the viewer uploaded. Coordinators/admins may remove any file
 * in a space they can open. (The old Remove button had no ownership check.)
 */
export const removeFile = authedAction
  .inputSchema(idSchema)
  .action(async ({ parsedInput: { id }, ctx: { viewer } }) => {
    const [file] = await db.select().from(pnFiles).where(eq(pnFiles.id, id)).limit(1);
    if (!file) throw new UserFacingError("That file was already removed.");
    const access = await fileSpaceAccess(viewer, file.participantId);
    const mine = file.uploadedBy === viewer.id;
    if (!access || (!mine && !can(viewer, "peernav.allParticipants"))) {
      throw new UserFacingError("You can only remove files you uploaded.");
    }
    await db.delete(pnFiles).where(eq(pnFiles.id, file.id));
    try {
      await deleteFile(file.storageKey);
    } catch (error) {
      logger.warn({ fileId: id, err: (error as Error).message }, "stored file delete failed");
    }
    revalidatePath(`/coach/${file.participantId}/files`);
    revalidatePath("/coaching/files");
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Coach assignment (coordinators)                                     */
/* ------------------------------------------------------------------ */

export const assignCoach = permissionAction("peernav.assignCoach")
  .inputSchema(assignCoachSchema)
  .action(async ({ parsedInput: { participantId, coachId }, ctx: { viewer } }) => {
    const userFields = { role: users.role, name: users.name, banned: users.banned };
    const [[participant], [coach]] = await Promise.all([
      db.select(userFields).from(users).where(eq(users.id, participantId)).limit(1),
      coachId ? db.select(userFields).from(users).where(eq(users.id, coachId)).limit(1) : Promise.resolve([]),
    ]);
    if (!participant || !isPnParticipant(participant.role)) throw new UserFacingError("That person isn't a Peer Navigation participant.");
    if (coachId && (!coach || coach.banned || !parseRoles(coach.role).includes(PN_COACH_ROLE))) {
      throw new UserFacingError("Choose an active peer navigator.");
    }
    if (coachId === participantId) throw new UserFacingError("A participant can't be their own coach.");

    const [profile] = await db.select({ coachId: profiles.coachId }).from(profiles).where(eq(profiles.userId, participantId)).limit(1);
    const previous = profile?.coachId ?? null;
    if (previous === coachId) return { ok: true, changed: false };

    const now = new Date();
    await withTransaction(async (tx) => {
      await tx
        .insert(profiles)
        .values({ userId: participantId, coachId })
        .onConflictDoUpdate({ target: profiles.userId, set: { coachId } });
      await tx.insert(pnCoachAssignments).values({
        participantId,
        coachId,
        previousCoachId: previous,
        assignedBy: viewer.id,
        createdAt: now,
      });
    });

    if (coachId) {
      await notify({
        userId: coachId,
        kind: "system",
        text: `${participant.name ?? "A participant"} is now one of your participants.`,
        dedupeKey: `pn-assign:${participantId}:${coachId}:${now.getTime()}`,
        actorId: viewer.id,
        href: `/coach/${participantId}`,
      });
      await notify({
        userId: participantId,
        kind: "system",
        text: `You've been matched with ${coach?.name ?? "a peer navigator"}, your peer navigator.`,
        dedupeKey: `pn-matched:${coachId}:${now.getTime()}`,
        actorId: viewer.id,
        href: "/coaching/coach",
      });
    }
    revalidatePath("/coach", "layout");
    revalidatePath("/coaching", "layout");
    return { ok: true, changed: true };
  });

/** Loads one saved revision (read-only history view). */
export const loadRevision = permissionAction("peernav.coach")
  .inputSchema(z.object({ participantId: rowId, revisionId: rowId }))
  .action(async ({ parsedInput: { participantId, revisionId }, ctx: { viewer } }) => {
    await assertParticipantAccess(viewer, participantId);
    const revision = await getRevisionAnswers(participantId, revisionId);
    if (!revision) throw new UserFacingError("That version couldn't be found.");
    return revision;
  });
