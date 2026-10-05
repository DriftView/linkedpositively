import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { profiles, smsInbound, smsSends, smsTemplates, users } from "@/server/db/schema";
import { getProgramTemplates } from "./service";
import type { InboundRow, SendLogRow, TemplateRow } from "./types";

function iso(date: Date | null | undefined) {
  return date ? new Date(date).toISOString() : null;
}

/** Templates for the editor, with how each week's message has performed. */
export async function getTemplateRows(): Promise<TemplateRow[]> {
  const [templates, stats, meta] = await Promise.all([
    getProgramTemplates(),
    db
      .select({
        flag: smsSends.flag,
        sent: sql<number>`count(*) filter (where ${smsSends.status} = 'sent')`.mapWith(Number),
        clicked: sql<number>`count(*) filter (where ${smsSends.status} = 'sent' and ${smsSends.clickedAt} is not null)`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${smsSends.status} = 'failed')`.mapWith(Number),
        scheduled: sql<number>`count(*) filter (where ${smsSends.status} = 'scheduled')`.mapWith(Number),
      })
      .from(smsSends)
      .groupBy(smsSends.flag),
    db
      .select({ key: smsTemplates.key, updatedAt: smsTemplates.updatedAt, updatedBy: users.name })
      .from(smsTemplates)
      .leftJoin(users, eq(users.id, smsTemplates.updatedBy)),
  ]);
  const byFlag = new Map(stats.map((row) => [row.flag, row]));
  const metaByKey = new Map(meta.map((row) => [row.key, row]));
  return [...templates.values()]
    .sort((a, b) => a.week - b.week)
    .map((template) => {
      const stat = byFlag.get(template.key);
      const info = metaByKey.get(template.key);
      return {
        ...template,
        sent: stat?.sent ?? 0,
        clicked: stat?.clicked ?? 0,
        failed: stat?.failed ?? 0,
        scheduled: stat?.scheduled ?? 0,
        updatedAt: iso(info?.updatedAt),
        updatedBy: info?.updatedBy ?? null,
      };
    });
}

async function peopleById(userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map<string, { name: string; studyId: string | null }>();
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username, studyId: profiles.studyId })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(users.id, ids));
  return new Map(rows.map((user) => [user.id, { name: user.name || user.username || "Member", studyId: user.studyId ?? null }]));
}

/** Recent sends and problems, plus what's coming up in the next two weeks. */
export async function getSendLog(): Promise<SendLogRow[]> {
  const now = new Date();
  const [past, upcoming] = await Promise.all([
    db
      .select()
      .from(smsSends)
      .where(ne(smsSends.status, "scheduled"))
      .orderBy(desc(smsSends.scheduledFor), desc(smsSends.id))
      .limit(2000),
    db
      .select()
      .from(smsSends)
      .where(and(eq(smsSends.status, "scheduled"), lte(smsSends.scheduledFor, new Date(now.getTime() + 14 * 86_400_000))))
      .orderBy(asc(smsSends.scheduledFor), asc(smsSends.id))
      .limit(1000),
  ]);
  const rows = [...upcoming, ...past];
  const people = await peopleById(rows.map((row) => row.userId));
  return rows.map((row) => {
    const person = people.get(row.userId);
    return {
      id: row.id,
      userId: row.userId,
      name: person?.name ?? "Deleted account",
      studyId: person?.studyId ?? null,
      flag: row.flag,
      week: row.week,
      status: row.status,
      reason: row.reason ?? null,
      scheduledFor: iso(row.scheduledFor)!,
      sentAt: iso(row.sentAt),
      clickedAt: iso(row.clickedAt),
      clicks: row.clicks,
      body: row.body ?? null,
      timezone: row.timezone,
    };
  });
}

export async function getInbound(): Promise<InboundRow[]> {
  const rows = await db.select().from(smsInbound).orderBy(desc(smsInbound.receivedAt), desc(smsInbound.id)).limit(500);
  const people = await peopleById(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)));
  return rows.map((row) => {
    const person = row.userId ? people.get(row.userId) : null;
    return {
      id: row.id,
      userId: row.userId,
      name: person?.name ?? null,
      studyId: person?.studyId ?? null,
      from: row.from,
      body: row.body,
      kind: row.kind,
      receivedAt: iso(row.receivedAt)!,
      read: Boolean(row.readAt),
    };
  });
}

export async function unreadInboundCount() {
  const [row] = await db
    .select({ n: count() })
    .from(smsInbound)
    .where(and(isNull(smsInbound.readAt), eq(smsInbound.kind, "message")));
  return row?.n ?? 0;
}
