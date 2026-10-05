import "server-only";
import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { loginSessions, pnSessionRevisions, pnSessions, profiles, users, type LoginSession } from "@/server/db/schema";
import { PN_PARTICIPANT_ROLE, roleFilter } from "./access";
import { CURRICULUM } from "./curriculum";
import { oneLine, reportDateTime, STATUS_LABELS, usageDateTime, usageDuration, type SessionStatus } from "./format";
import { iso, personColumns, toPerson } from "./people";

/** Legacy site timezone used by both reports. */
export const REPORT_TIMEZONE = "America/New_York";

/**
 * Participants a report covers. Coordinators/admins: every Peer Navigation
 * participant, including blocked accounts (as before). Coaches: only their own
 * participants (the old report showed coaches everyone).
 */
async function reportParticipants(viewer: Viewer) {
  const all = can(viewer, "peernav.allParticipants");
  return db
    .select({ ...personColumns, createdAt: users.createdAt, banned: users.banned, studyId: profiles.studyId })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(roleFilter(PN_PARTICIPANT_ROLE), all ? undefined : eq(profiles.coachId, viewer.id)))
    .orderBy(asc(users.createdAt), asc(users.id));
}

export type SessionReportRow = {
  id: string;
  name: string;
  username: string;
  blocked: boolean;
  createdAt: string | null;
  sessions: { serial: number; status: SessionStatus; lastActivityAt: string | null }[];
};

export async function sessionReport(viewer: Viewer): Promise<SessionReportRow[]> {
  const participants = await reportParticipants(viewer);
  const ids = participants.map((u) => u.id);
  const [sessions, revisions] = ids.length
    ? await Promise.all([
        db
          .select({
            participantId: pnSessions.participantId,
            serial: pnSessions.serial,
            status: pnSessions.status,
            startedAt: pnSessions.startedAt,
            completedAt: pnSessions.completedAt,
            lastActivityAt: pnSessions.lastActivityAt,
          })
          .from(pnSessions)
          .where(inArray(pnSessions.participantId, ids)),
        db
          .select({ participantId: pnSessionRevisions.participantId, serial: pnSessionRevisions.serial, last: max(pnSessionRevisions.createdAt) })
          .from(pnSessionRevisions)
          .where(inArray(pnSessionRevisions.participantId, ids))
          .groupBy(pnSessionRevisions.participantId, pnSessionRevisions.serial),
      ])
    : [[], []];
  const key = (p: string, s: number) => `${p}:${s}`;
  const sessionOf = new Map(sessions.map((s) => [key(s.participantId, s.serial), s]));
  const lastRevision = new Map(revisions.map((r) => [key(r.participantId, r.serial), r.last]));

  return participants.map((user) => {
    const person = toPerson(user);
    return {
      id: person.id,
      name: person.name,
      username: person.username,
      blocked: Boolean(user.banned),
      createdAt: iso(user.createdAt),
      sessions: CURRICULUM.map(({ serial }) => {
        const row = sessionOf.get(key(user.id, serial));
        const dates = [row?.completedAt, row?.startedAt, row?.lastActivityAt, lastRevision.get(key(user.id, serial))].filter(
          (d): d is Date => Boolean(d),
        );
        const last = dates.length ? new Date(Math.max(...dates.map((d) => +d))) : null;
        return { serial, status: (row?.status as SessionStatus) ?? "not_started", lastActivityAt: iso(last) };
      }),
    };
  });
}

/** Rows of Coach_SessionReport.csv, legacy columns and formats. */
export function sessionReportCsvRows(rows: SessionReportRow[]) {
  const header = ["Name", "eCoach Account Created"];
  for (const s of CURRICULUM) header.push(`${s.serial}. ${s.title} - Status`, `${s.serial}. ${s.title} - Last Activity`);
  const body = rows.map((row) => [
    row.username,
    reportDateTime(row.createdAt, REPORT_TIMEZONE),
    ...row.sessions.flatMap((s) => [STATUS_LABELS[s.status], reportDateTime(s.lastActivityAt, REPORT_TIMEZONE)]),
  ]);
  return [header, ...body];
}

/* ------------------------------------------------------------------ */
/* Usage report (legacy ecoach_standard_usage_report)                  */
/* ------------------------------------------------------------------ */

export const USAGE_PAGE_SIZE = 100;

export type UsageRow = {
  id: string;
  participantId: string;
  participantSid: string;
  name: string;
  loginAt: string;
  logoutAt: string | null;
  userAgent: string;
  duration: string;
};

async function usageScope(viewer: Viewer) {
  const participants = await reportParticipants(viewer);
  const ids = participants.map((u) => u.id);
  const studyIdOf = new Map(participants.map((p) => [p.id, p.studyId]));
  const personOf = new Map(participants.map((u) => [u.id, toPerson(u)]));
  /** Participant SID: study ID when set, otherwise the username (the old report fell back to the Drupal uid). */
  const sid = (id: string) => studyIdOf.get(id) || personOf.get(id)?.username || id;
  return { ids, sid, personOf };
}

type UsageSource = Pick<LoginSession, "id" | "userId" | "loginAt" | "logoutAt" | "userAgent">;

function toUsageRow(row: UsageSource, scope: Awaited<ReturnType<typeof usageScope>>): UsageRow {
  const userId = row.userId;
  return {
    id: row.id,
    participantId: userId,
    participantSid: scope.sid(userId),
    name: scope.personOf.get(userId)?.name ?? "",
    loginAt: row.loginAt.toISOString(),
    logoutAt: iso(row.logoutAt),
    userAgent: oneLine(row.userAgent ?? ""),
    duration: usageDuration(row.loginAt, row.logoutAt),
  };
}

const usageColumns = {
  id: loginSessions.id,
  userId: loginSessions.userId,
  loginAt: loginSessions.loginAt,
  logoutAt: loginSessions.logoutAt,
  userAgent: loginSessions.userAgent,
};

export async function usageReportPage(viewer: Viewer, page: number) {
  const scope = await usageScope(viewer);
  if (!scope.ids.length) return { total: 0, pages: 1, rows: [] as UsageRow[] };
  const where = inArray(loginSessions.userId, scope.ids);
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(loginSessions).where(where),
    db
      .select(usageColumns)
      .from(loginSessions)
      .where(where)
      .orderBy(desc(loginSessions.loginAt), desc(loginSessions.id))
      .offset((page - 1) * USAGE_PAGE_SIZE)
      .limit(USAGE_PAGE_SIZE),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / USAGE_PAGE_SIZE)), rows: rows.map((r) => toUsageRow(r, scope)) };
}

export async function usageReportCsvRows(viewer: Viewer) {
  const scope = await usageScope(viewer);
  const rows = scope.ids.length
    ? await db
        .select(usageColumns)
        .from(loginSessions)
        .where(inArray(loginSessions.userId, scope.ids))
        .orderBy(desc(loginSessions.loginAt), desc(loginSessions.id))
    : [];
  return [
    ["Participant SID", "Login Date and Time", "Type of Device Used", "Total Session Duration"],
    ...rows.map((r) => {
      const row = toUsageRow(r, scope);
      return [row.participantSid, usageDateTime(row.loginAt, REPORT_TIMEZONE), row.userAgent, row.duration];
    }),
  ];
}
