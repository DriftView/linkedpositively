import "server-only";
import { and, arrayContains, count, desc, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { startOfWeek, subDays } from "date-fns";
import { studyWeek } from "@/lib/dates";
import { parseRoles, primaryRoleLabel } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { auditLog, dailyCheckins, loginSessions, profiles, smsSends, users, weeklyCheckins } from "@/server/db/schema";
import { hasPassword } from "./accounts";
import { hasRole } from "./role-sql";
import type { AuditRow, DashboardData, UserDetail, UserRow } from "./types";

function iso(date: Date | null | undefined) {
  return date ? new Date(date).toISOString() : null;
}

const coachUsers = alias(users, "coach");

/** Latest sign-in per user (correlated, uses login_sessions_user_idx). */
const lastLoginAt =
  sql<Date | null>`(select max(${loginSessions.loginAt}) from ${loginSessions} where ${loginSessions.userId} = ${users}.${sql.identifier("id")})`.mapWith(
    loginSessions.loginAt,
  );

/** Columns of a users table row joined with its profile and coach, as read by `toRow`. */
const ROW_FIELDS = {
  id: users.id,
  name: users.name,
  email: users.email,
  username: users.username,
  displayUsername: users.displayUsername,
  role: users.role,
  banned: users.banned,
  banReason: users.banReason,
  timezone: users.timezone,
  programs: users.programs,
  createdAt: users.createdAt,
  studyId: profiles.studyId,
  phone: profiles.phone,
  interventionStartDate: profiles.interventionStartDate,
  roleChangedAt: profiles.roleChangedAt,
  smsOptOut: profiles.smsOptOut,
  coachId: profiles.coachId,
  pronouns: profiles.pronouns,
  age: profiles.age,
  lastActiveAt: profiles.lastActiveAt,
  coachName: coachUsers.name,
  coachUsername: coachUsers.username,
  lastLoginAt,
};

function userRowQuery() {
  return db
    .select(ROW_FIELDS)
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(coachUsers, eq(coachUsers.id, profiles.coachId));
}

type JoinedUser = Awaited<ReturnType<typeof userRowQuery>>[number];

function toRow(user: JoinedUser, lastLogin: Date | null, now: Date): UserRow {
  const roles = parseRoles(user.role);
  const timezone = user.timezone || "America/New_York";
  const start = user.interventionStartDate ?? null;
  // The coach id is kept only while the coach's account exists (FK on delete set null).
  const coachId = user.coachId ?? null;
  return {
    id: user.id,
    name: user.name || user.displayUsername || user.username || "Member",
    username: user.displayUsername || user.username || "",
    email: user.email ?? "",
    roles,
    roleLabel: primaryRoleLabel(roles),
    banned: Boolean(user.banned),
    programs: user.programs ?? ["lp"],
    createdAt: iso(user.createdAt) ?? new Date(0).toISOString(),
    studyId: user.studyId ?? null,
    coachId,
    coachName: coachId ? user.coachName || user.coachUsername || "Peer navigator" : null,
    interventionStartDate: iso(start),
    studyWeek: start && roles.includes("participant") ? studyWeek(start, now, timezone) : null,
    lastLoginAt: iso(lastLogin ?? user.lastActiveAt ?? null),
    smsOptOut: Boolean(user.smsOptOut),
    hasPhone: Boolean(user.phone),
  };
}

/** Every account with its study fields, for the staff users table (the study has a few hundred people at most). */
export async function listUsers(): Promise<UserRow[]> {
  const rows = await userRowQuery().orderBy(desc(users.createdAt), desc(users.id)).limit(5000);
  const now = new Date();
  return rows.map((row) => toRow(row, row.lastLoginAt, now));
}

export async function listCoaches() {
  const coaches = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .where(and(hasRole(users.role, "coach"), sql`${users.banned} is not true`))
    .orderBy(users.name, users.id);
  return coaches.map((coach) => ({ id: coach.id, name: coach.name || coach.username || "Peer navigator" }));
}

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  if (!isUuid(userId)) return null;
  const [user] = await userRowQuery().where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [logins, sms, auditRows, passwordSet] = await Promise.all([
    db
      .select({
        id: loginSessions.id,
        loginAt: loginSessions.loginAt,
        logoutAt: loginSessions.logoutAt,
        userAgent: loginSessions.userAgent,
        program: loginSessions.program,
      })
      .from(loginSessions)
      .where(eq(loginSessions.userId, userId))
      .orderBy(desc(loginSessions.loginAt), desc(loginSessions.id))
      .limit(50),
    db
      .select({
        id: smsSends.id,
        flag: smsSends.flag,
        week: smsSends.week,
        cycle: smsSends.cycle,
        scheduledFor: smsSends.scheduledFor,
        status: smsSends.status,
        reason: smsSends.reason,
        sentAt: smsSends.sentAt,
        clickedAt: smsSends.clickedAt,
        clicks: smsSends.clicks,
        body: smsSends.body,
        linkPath: smsSends.linkPath,
      })
      .from(smsSends)
      .where(eq(smsSends.userId, userId))
      .orderBy(desc(smsSends.scheduledFor), desc(smsSends.id))
      .limit(80),
    db
      .select()
      .from(auditLog)
      .where(arrayContains(auditLog.targetIds, [userId]))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(30),
    hasPassword(userId),
  ]);
  const row = toRow(user, logins[0]?.loginAt ?? null, new Date());
  const actors = await actorNames(auditRows.map((entry) => entry.actorId));
  return {
    ...row,
    banReason: user.banReason ?? null,
    timezone: user.timezone || "America/New_York",
    phone: user.phone ?? null,
    pronouns: user.pronouns ?? null,
    age: user.age ?? null,
    roleChangedAt: iso(user.roleChangedAt),
    passwordSet,
    logins: logins.map((login) => ({
      id: login.id,
      loginAt: iso(login.loginAt)!,
      logoutAt: iso(login.logoutAt),
      device: describeAgent(login.userAgent ?? ""),
      program: login.program ?? "lp",
    })),
    sms: sms.map((message) => ({
      id: message.id,
      flag: message.flag,
      week: message.week ?? 0,
      cycle: message.cycle,
      scheduledFor: iso(message.scheduledFor)!,
      status: message.status,
      reason: message.reason ?? null,
      sentAt: iso(message.sentAt),
      clickedAt: iso(message.clickedAt),
      clicks: message.clicks ?? 0,
      body: message.body ?? null,
      linkPath: message.linkPath ?? null,
    })),
    audit: auditRows.map((entry) => toAuditRow(entry, actors)),
  };
}

/** "Chrome on Windows"-style label; the raw user agent stays in the database. */
export function describeAgent(agent: string) {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Chrome\//.test(agent)
      ? "Chrome"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac OS X/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

async function actorNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((user) => [user.id, user.name || user.username || "Staff"]));
}

type AuditEntry = {
  id: string;
  actorId: string | null;
  impersonatedBy: string | null;
  action: string;
  targetIds: string[];
  summary: string;
  at: Date;
};

function toAuditRow(entry: AuditEntry, names: Map<string, string>): AuditRow {
  const actorId = entry.actorId ?? null;
  return {
    id: entry.id,
    at: iso(entry.at)!,
    action: entry.action,
    summary: entry.summary,
    actorId,
    actorName: actorId ? (names.get(actorId) ?? "Former staff member") : "Automatic",
    impersonatedBy: entry.impersonatedBy ? (names.get(entry.impersonatedBy) ?? "an administrator") : null,
    targetIds: entry.targetIds ?? [],
    targetNames: [],
  };
}

export async function listAudit(options: { action?: string; limit?: number } = {}): Promise<AuditRow[]> {
  // Prefix match on the action; only letters and dots survive, so no LIKE wildcards can get in.
  const prefix = options.action?.replace(/[^a-zA-Z.]/g, "");
  const rows = await db
    .select()
    .from(auditLog)
    .where(prefix ? like(auditLog.action, `${prefix}%`) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(options.limit ?? 500);
  const ids = rows.flatMap((row) => [row.actorId, row.impersonatedBy, ...(row.targetIds ?? []).slice(0, 3)]);
  const names = await actorNames(ids);
  return rows.map((row) => {
    const audit = toAuditRow(row, names);
    audit.targetNames = (row.targetIds ?? []).slice(0, 3).map((id) => names.get(id) ?? "Deleted account");
    return audit;
  });
}

const countOf = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;

export async function getDashboard(): Promise<DashboardData> {
  const now = new Date();
  const weekAgo = subDays(now, 7);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const people = await db
    .select({
      role: users.role,
      banned: users.banned,
      timezone: users.timezone,
      interventionStartDate: profiles.interventionStartDate,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id));

  let control = 0;
  let participants = 0;
  let peerNav = 0;
  let blocked = 0;
  let staff = 0;
  const weeks = new Array(25).fill(0) as number[];
  let completed = 0;
  for (const user of people) {
    const roles = parseRoles(user.role);
    if (user.banned) blocked++;
    if (roles.some((role) => ["admin", "research_admin", "coordinator", "coach"].includes(role))) staff++;
    if (user.banned) continue;
    if (roles.includes("control")) control++;
    if (roles.includes("ecoach_user")) peerNav++;
    if (roles.includes("participant")) {
      participants++;
      const start = user.interventionStartDate;
      if (start) {
        const week = studyWeek(start, now, user.timezone || "America/New_York");
        if (week >= 1 && week <= 24) weeks[week]++;
        else if (week > 24) completed++;
      }
    }
  }

  const recentLoginRows = db
    .select({ userId: loginSessions.userId, loginAt: loginSessions.loginAt })
    .from(loginSessions)
    .orderBy(desc(loginSessions.loginAt), desc(loginSessions.id))
    .limit(200)
    .as("recent");

  const [
    activeUsers,
    loginsThisWeek,
    smsSent,
    smsFailed,
    smsScheduledToday,
    smsClicks,
    dailyCount,
    weeklyCount,
    recentAudit,
    recentLogins,
  ] = await Promise.all([
    // Signed in during the last 7 days, or seen active (profile marker) in that time.
    countOf(
      db.select({ n: sql<number>`count(*)::int` }).from(
        db
          .select({ userId: loginSessions.userId })
          .from(loginSessions)
          .where(gte(loginSessions.loginAt, weekAgo))
          .union(db.select({ userId: profiles.userId }).from(profiles).where(gte(profiles.lastActiveAt, weekAgo)))
          .as("active"),
      ),
    ),
    countOf(db.select({ n: count() }).from(loginSessions).where(gte(loginSessions.loginAt, weekAgo))),
    countOf(
      db
        .select({ n: count() })
        .from(smsSends)
        .where(and(eq(smsSends.status, "sent"), gte(smsSends.sentAt, weekAgo))),
    ),
    countOf(
      db
        .select({ n: count() })
        .from(smsSends)
        .where(and(eq(smsSends.status, "failed"), gte(smsSends.updatedAt, weekAgo))),
    ),
    countOf(
      db
        .select({ n: count() })
        .from(smsSends)
        .where(
          and(
            eq(smsSends.status, "scheduled"),
            gte(smsSends.scheduledFor, now),
            lte(smsSends.scheduledFor, new Date(now.getTime() + 86_400_000)),
          ),
        ),
    ),
    countOf(db.select({ n: count() }).from(smsSends).where(gte(smsSends.clickedAt, weekAgo))),
    countOf(db.select({ n: count() }).from(dailyCheckins).where(gte(dailyCheckins.createdAt, weekStart))),
    countOf(db.select({ n: count() }).from(weeklyCheckins).where(gte(weeklyCheckins.createdAt, weekStart))),
    db.select().from(auditLog).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(6),
    // The latest sign-in per person among the last 200 sign-ins, newest 6 people.
    db
      .select({
        userId: recentLoginRows.userId,
        loginAt: sql<Date>`max(${recentLoginRows.loginAt})`.mapWith(loginSessions.loginAt),
      })
      .from(recentLoginRows)
      .groupBy(recentLoginRows.userId)
      .orderBy(sql`2 desc`, recentLoginRows.userId)
      .limit(6),
  ]);

  const names = await actorNames([
    ...recentAudit.map((row) => row.actorId),
    ...recentLogins.map((login) => login.userId),
  ]);
  return {
    enrolled: control + participants,
    control,
    participants,
    peerNav,
    blocked,
    staff,
    completed,
    weeks: weeks.slice(1).map((n, index) => ({ week: index + 1, count: n })),
    activeUsers,
    loginsThisWeek,
    checkinsThisWeek: dailyCount + weeklyCount,
    smsSent,
    smsFailed,
    smsClicks,
    smsScheduledToday,
    recentAudit: recentAudit.map((row) => toAuditRow(row, names)),
    recentLogins: recentLogins.map((login) => ({
      userId: login.userId,
      name: names.get(login.userId) ?? "Member",
      at: iso(login.loginAt)!,
    })),
  };
}

export type RandomizationData = { control: UserRow[]; participants: UserRow[] };

export async function getRandomization(): Promise<RandomizationData> {
  const rows = await listUsers();
  const active = rows.filter((row) => !row.banned);
  return {
    control: active.filter((row) => row.roles.includes("control") && !row.roles.includes("participant")),
    participants: active
      .filter((row) => row.roles.includes("participant"))
      .sort((a, b) => (b.interventionStartDate ?? "").localeCompare(a.interventionStartDate ?? "")),
  };
}
