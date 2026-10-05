import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, max, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import {
  loginSessions,
  messageThreadMembers,
  messageThreads,
  pnFiles,
  pnNotes,
  pnSessionRevisions,
  pnSessions,
  profiles,
  users,
} from "@/server/db/schema";
import { PN_COACH_ROLE, PN_PARTICIPANT_ROLE, roleFilter, type StaffParticipantAccess } from "./access";
import type { Answers } from "./answers";
import { CURRICULUM, getCurriculumSession } from "./curriculum";
import type { SessionStatus } from "./format";
import { unreadByParticipant } from "./messages";
import { iso, peopleById, personColumns, toPerson } from "./people";
import type {
  CoachCard,
  FileItem,
  LegacySession,
  NoteItem,
  ParticipantDetail,
  ParticipantListItem,
  PersonRef,
  PlanSession,
  RevisionSummary,
  RunnerData,
} from "./types";

const CURRENT_SERIALS = CURRICULUM.map((s) => s.serial);

/** Not blocked (`banned` is null or false). */
const notBanned = sql`${users.banned} is not true`;

/* ------------------------------------------------------------------ */
/* Participants                                                        */
/* ------------------------------------------------------------------ */

/**
 * The participants a staff member works with: a coach's assigned
 * participants, or every Peer Navigation participant for coordinators/admins.
 */
export const listParticipants = cache(async (viewer: Viewer): Promise<ParticipantListItem[]> => {
  const all = can(viewer, "peernav.allParticipants");
  const rows = await db
    .select({ ...personColumns, pronouns: profiles.pronouns, coachId: profiles.coachId })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(roleFilter(PN_PARTICIPANT_ROLE), notBanned, all ? undefined : eq(profiles.coachId, viewer.id)));
  const ids = rows.map((u) => u.id);
  const [sessions, unread, coaches] = await Promise.all([
    ids.length
      ? db
          .select({
            participantId: pnSessions.participantId,
            serial: pnSessions.serial,
            order: pnSessions.order,
            status: pnSessions.status,
            lastActivityAt: pnSessions.lastActivityAt,
          })
          .from(pnSessions)
          .where(and(inArray(pnSessions.participantId, ids), inArray(pnSessions.serial, CURRENT_SERIALS)))
      : Promise.resolve([]),
    unreadByParticipant(viewer.id),
    peopleById(rows.map((p) => p.coachId)),
  ]);
  const sessionsOf = new Map<string, typeof sessions>();
  for (const s of sessions) {
    sessionsOf.set(s.participantId, [...(sessionsOf.get(s.participantId) ?? []), s]);
  }

  return rows
    .map((user) => {
      const sessionRows = (sessionsOf.get(user.id) ?? []).sort((a, b) => a.order - b.order || a.serial - b.serial);
      const last = sessionRows.reduce<Date | null>(
        (latest, r) => (r.lastActivityAt && (!latest || r.lastActivityAt > latest) ? r.lastActivityAt : latest),
        null,
      );
      return {
        ...toPerson(user),
        pronouns: user.pronouns ?? null,
        completed: sessionRows.filter((r) => r.status === "complete").length,
        total: CURRENT_SERIALS.length,
        currentSerial: sessionRows.find((r) => r.status === "in_progress")?.serial ?? null,
        lastActivityAt: iso(last),
        unread: unread.get(user.id) ?? 0,
        coach: user.coachId ? (coaches.get(user.coachId) ?? null) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
});

export async function getParticipantDetail(access: StaffParticipantAccess): Promise<ParticipantDetail | null> {
  const id = access.participantId;
  if (!isUuid(id)) return null;
  const [[user], [profile], [stats]] = await Promise.all([
    db
      .select({ ...personColumns, email: users.email, createdAt: users.createdAt, banned: users.banned })
      .from(users)
      .where(eq(users.id, id))
      .limit(1),
    db.select().from(profiles).where(eq(profiles.userId, id)).limit(1),
    db
      .select({
        count: count(),
        last: max(loginSessions.loginAt),
        seconds: sql<number>`coalesce(sum(case when ${loginSessions.logoutAt} > ${loginSessions.loginAt} then extract(epoch from ${loginSessions.logoutAt} - ${loginSessions.loginAt}) else 0 end), 0)`.mapWith(
          Number,
        ),
      })
      .from(loginSessions)
      .where(eq(loginSessions.userId, id)),
  ]);
  if (!user) return null;
  const coach = profile?.coachId ? ((await peopleById([profile.coachId])).get(profile.coachId) ?? null) : null;
  return {
    ...toPerson(user),
    email: user.email ?? "",
    firstName: profile?.firstName ?? null,
    pronouns: profile?.pronouns ?? null,
    location: profile?.location ?? null,
    age: profile?.age ?? null,
    onPrep: profile?.onPrep ?? null,
    studyId: profile?.studyId ?? null,
    participantCode: profile?.participantCode ?? null,
    coach,
    isAssignedCoach: access.isAssignedCoach,
    createdAt: iso(user.createdAt),
    blocked: Boolean(user.banned),
    timeOnSiteSeconds: Math.round(stats?.seconds ?? 0),
    signIns: stats?.count ?? 0,
    lastSignInAt: iso(stats?.last),
    avatarVersion: iso(profile?.updatedAt),
  };
}

/** Name and pronouns only, for headers. */
export async function getParticipantHeader(participantId: string) {
  if (!isUuid(participantId)) return null;
  const [user] = await db
    .select({ ...personColumns, pronouns: profiles.pronouns, profileUpdatedAt: profiles.updatedAt })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, participantId))
    .limit(1);
  if (!user) return null;
  return { ...toPerson(user), pronouns: user.pronouns ?? null, avatarVersion: iso(user.profileUpdatedAt) };
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

function statusOf(row: { status?: string | null } | undefined): SessionStatus {
  return (row?.status as SessionStatus) ?? "not_started";
}

/** The 6 current sessions in the coach-defined order, plus migrated sessions 7–10. */
export async function getSessionPlan(participantId: string): Promise<{ plan: PlanSession[]; legacy: LegacySession[] }> {
  const [rows, revisionStats] = isUuid(participantId)
    ? await Promise.all([
        db.select().from(pnSessions).where(eq(pnSessions.participantId, participantId)),
        db
          .select({ serial: pnSessionRevisions.serial, count: count(), last: max(pnSessionRevisions.createdAt) })
          .from(pnSessionRevisions)
          .where(eq(pnSessionRevisions.participantId, participantId))
          .groupBy(pnSessionRevisions.serial),
      ])
    : [[], []];
  const statsOf = new Map(revisionStats.map((r) => [r.serial, r]));
  const rowOf = new Map(rows.map((r) => [r.serial, r]));

  const plan = CURRICULUM.map((session) => {
    const row = rowOf.get(session.serial);
    const stats = statsOf.get(session.serial);
    return {
      serial: session.serial,
      title: session.title,
      description: session.description,
      order: row?.order ?? session.serial,
      status: statusOf(row),
      startedAt: iso(row?.startedAt),
      completedAt: iso(row?.completedAt),
      lastModifiedAt: iso(stats?.last),
      revisionCount: stats?.count ?? 0,
      worksheets: session.worksheets,
    };
  }).sort((a, b) => a.order - b.order || a.serial - b.serial);

  const legacy = rows
    .filter((r) => !CURRENT_SERIALS.includes(r.serial))
    .sort((a, b) => a.serial - b.serial)
    .map((r) => ({
      serial: r.serial,
      status: statusOf(r),
      startedAt: iso(r.startedAt),
      completedAt: iso(r.completedAt),
      revisionCount: statsOf.get(r.serial)?.count ?? 0,
    }));
  return { plan, legacy };
}

async function noteItems(viewer: Viewer, notes: Awaited<ReturnType<typeof findNotes>>): Promise<NoteItem[]> {
  const people = await peopleById(notes.map((n) => n.authorId));
  return notes.map((note) => ({
    id: note.id,
    text: note.text,
    method: note.methodOfContact ?? null,
    sessionSerial: note.sessionSerial ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    edited: +note.updatedAt - +note.createdAt > 1000,
    author: note.authorId ? (people.get(note.authorId) ?? null) : null,
    canEdit: Boolean(note.authorId) && note.authorId === viewer.id,
  }));
}

/** Notes that aren't deleted, newest first. */
function findNotes(where: SQL | undefined) {
  return db
    .select()
    .from(pnNotes)
    .where(and(where, isNull(pnNotes.deletedAt)))
    .orderBy(desc(pnNotes.createdAt), desc(pnNotes.id))
    .limit(500);
}

export async function getRunnerData(viewer: Viewer, participantId: string, serial: number): Promise<RunnerData | null> {
  if (!getCurriculumSession(serial) || !isUuid(participantId)) return null;
  const [header, [row], planRows] = await Promise.all([
    getParticipantHeader(participantId),
    db
      .select()
      .from(pnSessions)
      .where(and(eq(pnSessions.participantId, participantId), eq(pnSessions.serial, serial)))
      .limit(1),
    db
      .select({ serial: pnSessions.serial, order: pnSessions.order })
      .from(pnSessions)
      .where(and(eq(pnSessions.participantId, participantId), inArray(pnSessions.serial, CURRENT_SERIALS))),
  ]);
  if (!header) return null;
  const [revisions, notes] = await Promise.all([
    row
      ? db
          .select({
            id: pnSessionRevisions.id,
            coachId: pnSessionRevisions.coachId,
            createdAt: pnSessionRevisions.createdAt,
            complete: pnSessionRevisions.complete,
          })
          .from(pnSessionRevisions)
          .where(eq(pnSessionRevisions.sessionId, row.id))
          .orderBy(desc(pnSessionRevisions.createdAt), desc(pnSessionRevisions.id))
          .limit(100)
      : Promise.resolve([]),
    findNotes(and(eq(pnNotes.participantId, participantId), eq(pnNotes.sessionSerial, serial))),
  ]);
  const [latestDoc] = revisions[0]
    ? await db.select({ answers: pnSessionRevisions.answers }).from(pnSessionRevisions).where(eq(pnSessionRevisions.id, revisions[0].id)).limit(1)
    : [];
  const people = await peopleById(revisions.map((r) => r.coachId));
  const summaries: RevisionSummary[] = revisions.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    coach: r.coachId ? (people.get(r.coachId) ?? null) : null,
    complete: Boolean(r.complete),
  }));
  const orderOf = new Map(planRows.map((r) => [r.serial, r.order]));
  const planOrder = [...CURRENT_SERIALS].sort((a, b) => (orderOf.get(a) ?? a) - (orderOf.get(b) ?? b) || a - b);
  const noteList = await noteItems(viewer, notes);
  return {
    participant: { id: header.id, name: header.name, username: header.username, pronouns: header.pronouns },
    serial,
    status: statusOf(row),
    startedAt: iso(row?.startedAt),
    completedAt: iso(row?.completedAt),
    answers: (latestDoc?.answers as Answers | undefined) ?? {},
    latest: summaries[0] ?? null,
    revisions: summaries,
    notes: noteList,
    defaultMethod: notes.find((n) => n.methodOfContact)?.methodOfContact ?? null,
    planOrder,
  };
}

/** Answers of one revision, for the read-only history view. */
export async function getRevisionAnswers(participantId: string, revisionId: string) {
  if (!isUuid(revisionId) || !isUuid(participantId)) return null;
  const [revision] = await db
    .select({ serial: pnSessionRevisions.serial, answers: pnSessionRevisions.answers, complete: pnSessionRevisions.complete })
    .from(pnSessionRevisions)
    .where(and(eq(pnSessionRevisions.id, revisionId), eq(pnSessionRevisions.participantId, participantId)))
    .limit(1);
  if (!revision) return null;
  return { serial: revision.serial, answers: (revision.answers ?? {}) as Answers, complete: Boolean(revision.complete) };
}

/* ------------------------------------------------------------------ */
/* Notes and files                                                     */
/* ------------------------------------------------------------------ */

export async function listNotes(viewer: Viewer, participantId: string) {
  if (!isUuid(participantId)) return [];
  return noteItems(viewer, await findNotes(eq(pnNotes.participantId, participantId)));
}

export async function listFiles(viewer: Viewer, participantId: string, options: { canRemoveAny?: boolean } = {}): Promise<FileItem[]> {
  if (!isUuid(participantId)) return [];
  const files = await db
    .select()
    .from(pnFiles)
    .where(eq(pnFiles.participantId, participantId))
    .orderBy(desc(pnFiles.createdAt), desc(pnFiles.id))
    .limit(500);
  const people = await peopleById(files.map((f) => f.uploadedBy));
  return files.map((file) => {
    const mine = file.uploadedBy === viewer.id;
    return {
      id: file.id,
      filename: file.filename,
      mime: file.mime,
      size: file.size,
      createdAt: file.createdAt.toISOString(),
      uploadedBy: file.uploadedBy ? (people.get(file.uploadedBy) ?? null) : null,
      mine,
      canRemove: mine || Boolean(options.canRemoveAny),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Participant side                                                    */
/* ------------------------------------------------------------------ */

/** The participant's assigned coach, for "My coach" (null when none). */
export async function getMyCoach(participantId: string): Promise<CoachCard | null> {
  if (!isUuid(participantId)) return null;
  const [mine] = await db.select({ coachId: profiles.coachId }).from(profiles).where(eq(profiles.userId, participantId)).limit(1);
  if (!mine?.coachId) return null;
  const [user] = await db
    .select({
      ...personColumns,
      firstName: profiles.firstName,
      pronouns: profiles.pronouns,
      location: profiles.location,
      aboutMe: profiles.aboutMe,
      zoomLink: profiles.zoomLink,
      profileUpdatedAt: profiles.updatedAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, mine.coachId))
    .limit(1);
  if (!user) return null;
  return {
    ...toPerson(user),
    firstName: user.firstName ?? null,
    pronouns: user.pronouns ?? null,
    location: user.location ?? null,
    aboutMe: user.aboutMe ?? null,
    zoomLink: safeUrl(user.zoomLink),
    avatarVersion: iso(user.profileUpdatedAt),
  };
}

/** The viewer's own Zoom link (coach "Launch Zoom"). */
export async function getOwnZoomLink(userId: string) {
  if (!isUuid(userId)) return null;
  const [profile] = await db.select({ zoomLink: profiles.zoomLink }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return safeUrl(profile?.zoomLink);
}

/** Only http(s) links are rendered as links. */
export function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Coach assignments                                                   */
/* ------------------------------------------------------------------ */

export async function listCoaches(): Promise<PersonRef[]> {
  const rows = await db
    .select(personColumns)
    .from(users)
    .where(and(roleFilter(PN_COACH_ROLE), notBanned))
    .orderBy(asc(users.id));
  return rows.map(toPerson).sort((a, b) => a.name.localeCompare(b.name));
}

/** Badge counts for a participant's tab bar. */
export async function participantTabCounts(viewerId: string, participantId: string) {
  if (!isUuid(participantId) || !isUuid(viewerId)) return { notes: 0, files: 0, hasThreads: false };
  const [[notes], [files], [threads]] = await Promise.all([
    db
      .select({ n: count() })
      .from(pnNotes)
      .where(and(eq(pnNotes.participantId, participantId), isNull(pnNotes.deletedAt))),
    db.select({ n: count() }).from(pnFiles).where(eq(pnFiles.participantId, participantId)),
    db
      .select({ n: count() })
      .from(messageThreads)
      .innerJoin(messageThreadMembers, and(eq(messageThreadMembers.threadId, messageThreads.id), eq(messageThreadMembers.userId, viewerId)))
      .where(eq(messageThreads.participantId, participantId)),
  ]);
  return { notes: notes.n, files: files.n, hasThreads: threads.n > 0 };
}
