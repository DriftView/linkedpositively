import "server-only";
import { aliasedTable, and, asc, count, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { isUuid } from "@/server/db/ids";
import { db } from "@/server/db/client";
import {
  aiConversations,
  aiKnowledgeArticles,
  aiMessages,
  aiPreferences,
  aiSafetyAlerts,
  profiles,
  usageEvents,
  users,
  type AiAlertStatus,
  type AiSafetyAlert,
} from "@/server/db/schema";
import type {
  AiPreferencesDTO,
  AiStatsDTO,
  AlertDetailDTO,
  AlertRowDTO,
  ArticleFormDTO,
  ArticleRowDTO,
  ChatMessageDTO,
  ConversationSummaryDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Member side
// ---------------------------------------------------------------------------

export async function getPreferences(userId: string): Promise<AiPreferencesDTO> {
  const [row] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, userId)).limit(1);
  return { personalize: row?.personalize ?? true, autoSpeak: row?.autoSpeak ?? false, look: row?.look ?? "amara" };
}

/** The member's visible conversations, most recent first. */
export async function listConversations(userId: string, limit = 30): Promise<ConversationSummaryDTO[]> {
  const rows = await db
    .select({ id: aiConversations.id, title: aiConversations.title, lastMessageAt: aiConversations.lastMessageAt, messageCount: aiConversations.messageCount })
    .from(aiConversations)
    .where(and(eq(aiConversations.userId, userId), isNull(aiConversations.hiddenAt)))
    .orderBy(desc(aiConversations.lastMessageAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, lastMessageAt: row.lastMessageAt.toISOString() }));
}

/** A conversation's messages, when it belongs to the member and isn't hidden. */
export async function getConversationMessages(userId: string, conversationId: string): Promise<ChatMessageDTO[] | null> {
  if (!isUuid(conversationId)) return null;
  const [conversation] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId), isNull(aiConversations.hiddenAt)))
    .limit(1);
  if (!conversation) return null;
  const rows = await db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      text: aiMessages.text,
      cards: aiMessages.cards,
      feedback: aiMessages.feedback,
      outcome: aiMessages.outcome,
      createdAt: aiMessages.createdAt,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt), desc(aiMessages.role));
  return rows.map((row) => ({
    ...row,
    feedback: row.feedback === 1 || row.feedback === -1 ? row.feedback : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Staff: safety alerts
// ---------------------------------------------------------------------------

const handler = aliasedTable(users, "handler");

export async function alertCounts(): Promise<Record<AiAlertStatus, number>> {
  const rows = await db.select({ status: aiSafetyAlerts.status, total: count() }).from(aiSafetyAlerts).groupBy(aiSafetyAlerts.status);
  const counts: Record<AiAlertStatus, number> = { open: 0, in_review: 0, resolved: 0 };
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

const PAGE_SIZE = 25;

function alertQuery(where?: SQL) {
  return db
    .select({
      id: aiSafetyAlerts.id,
      level: aiSafetyAlerts.level,
      category: aiSafetyAlerts.category,
      source: aiSafetyAlerts.source,
      status: aiSafetyAlerts.status,
      reason: aiSafetyAlerts.reason,
      conversationId: aiSafetyAlerts.conversationId,
      messageId: aiSafetyAlerts.messageId,
      staffNote: aiSafetyAlerts.staffNote,
      createdAt: aiSafetyAlerts.createdAt,
      updatedAt: aiSafetyAlerts.updatedAt,
      memberId: users.id,
      memberName: users.name,
      memberUsername: users.username,
      handledByName: handler.name,
    })
    .from(aiSafetyAlerts)
    .innerJoin(users, eq(users.id, aiSafetyAlerts.userId))
    .leftJoin(handler, eq(handler.id, aiSafetyAlerts.handledBy))
    .where(where);
}

type AlertRow = Pick<AiSafetyAlert, "id" | "level" | "category" | "source" | "status" | "reason" | "conversationId" | "messageId" | "staffNote" | "createdAt" | "updatedAt"> & {
  memberId: string;
  memberName: string;
  memberUsername: string | null;
  handledByName: string | null;
};

function toAlertRow(row: AlertRow): AlertRowDTO {
  return {
    id: row.id,
    level: row.level,
    category: row.category,
    source: row.source,
    status: row.status,
    reason: row.reason,
    member: { id: row.memberId, name: row.memberName, username: row.memberUsername ?? "" },
    conversationId: row.conversationId,
    handledByName: row.handledByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Alerts by status: urgent first, then oldest first, so nobody waits too long. */
export async function listAlerts(input: { status: AiAlertStatus | "all"; page?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const where = input.status === "all" ? undefined : eq(aiSafetyAlerts.status, input.status);
  const levelOrder = sql`case ${aiSafetyAlerts.level} when 'urgent' then 0 when 'elevated' then 1 else 2 end`;
  const [rows, [{ total }]] = await Promise.all([
    alertQuery(where)
      .orderBy(...(input.status === "resolved" || input.status === "all" ? [desc(aiSafetyAlerts.updatedAt)] : [levelOrder, asc(aiSafetyAlerts.createdAt)]))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(aiSafetyAlerts).where(where),
  ]);
  return { alerts: rows.map(toAlertRow), page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getAlertDetail(id: string): Promise<AlertDetailDTO | null> {
  if (!isUuid(id)) return null;
  const [row]: AlertRow[] = await alertQuery(eq(aiSafetyAlerts.id, id)).limit(1);
  if (!row) return null;
  const base = toAlertRow(row);
  const coach = aliasedTable(users, "coach");
  const [[coachRow], transcript] = await Promise.all([
    db
      .select({ name: coach.name })
      .from(profiles)
      .innerJoin(coach, eq(coach.id, profiles.coachId))
      .where(eq(profiles.userId, base.member.id))
      .limit(1),
    row.conversationId
      ? db
          .select({ id: aiMessages.id, role: aiMessages.role, text: aiMessages.text, risk: aiMessages.risk, createdAt: aiMessages.createdAt })
          .from(aiMessages)
          .where(eq(aiMessages.conversationId, row.conversationId))
          .orderBy(asc(aiMessages.createdAt), desc(aiMessages.role))
      : Promise.resolve([]),
  ]);
  return {
    ...base,
    staffNote: row.staffNote ?? "",
    messageId: row.messageId,
    coachName: coachRow?.name ?? null,
    transcript: transcript.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
  };
}

// ---------------------------------------------------------------------------
// Staff: knowledge articles
// ---------------------------------------------------------------------------

export async function listArticles(): Promise<ArticleRowDTO[]> {
  const rows = await db
    .select({
      id: aiKnowledgeArticles.id,
      title: aiKnowledgeArticles.title,
      topic: aiKnowledgeArticles.topic,
      published: aiKnowledgeArticles.published,
      needsReview: aiKnowledgeArticles.needsReview,
      updatedAt: aiKnowledgeArticles.updatedAt,
    })
    .from(aiKnowledgeArticles)
    .orderBy(asc(aiKnowledgeArticles.topic), asc(aiKnowledgeArticles.title));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getArticle(id: string): Promise<ArticleFormDTO | null> {
  if (!isUuid(id)) return null;
  const reviewer = aliasedTable(users, "reviewer");
  const [row] = await db
    .select({ article: aiKnowledgeArticles, reviewedByName: reviewer.name })
    .from(aiKnowledgeArticles)
    .leftJoin(reviewer, eq(reviewer.id, aiKnowledgeArticles.reviewedBy))
    .where(eq(aiKnowledgeArticles.id, id))
    .limit(1);
  if (!row) return null;
  const { article } = row;
  return {
    id: article.id,
    title: article.title,
    topic: article.topic,
    body: article.body,
    sourceUrl: article.sourceUrl ?? "",
    published: article.published,
    needsReview: article.needsReview,
    reviewedByName: row.reviewedByName,
    reviewedAt: article.reviewedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Staff: analytics
// ---------------------------------------------------------------------------

/** Engagement, quality and safety numbers for the last `days` days (ids and counts only). */
export async function aiStats(days = 30): Promise<AiStatsDTO> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const inWindow = gte(aiMessages.createdAt, since);
  const memberMessages = and(inWindow, eq(aiMessages.role, "user"));
  const replies = and(inWindow, eq(aiMessages.role, "assistant"));
  const events = (types: string[]): SQL => and(gte(usageEvents.at, since), inArray(usageEvents.type, types))!;

  const [[messageTotals], [replyTotals], [conversationTotals], alertRows, eventRows, daily, [resolved]] = await Promise.all([
    db
      .select({
        members: sql<number>`count(distinct ${aiMessages.userId})`.mapWith(Number),
        messages: count(),
        voice: sql<number>`count(*) filter (where ${aiMessages.viaVoice})`.mapWith(Number),
      })
      .from(aiMessages)
      .where(memberMessages),
    db
      .select({
        helpful: sql<number>`count(*) filter (where ${aiMessages.feedback} = 1)`.mapWith(Number),
        notHelpful: sql<number>`count(*) filter (where ${aiMessages.feedback} = -1)`.mapWith(Number),
        fallbacks: sql<number>`count(*) filter (where ${aiMessages.outcome} <> 'answered')`.mapWith(Number),
        avgLatency: sql<number | null>`avg(${aiMessages.latencyMs}) filter (where ${aiMessages.outcome} = 'answered')`.mapWith((value) => (value == null ? null : Math.round(Number(value)))),
        input: sql<number>`coalesce(sum(${aiMessages.inputTokens}), 0)`.mapWith(Number),
        output: sql<number>`coalesce(sum(${aiMessages.outputTokens}), 0)`.mapWith(Number),
      })
      .from(aiMessages)
      .where(replies),
    db.select({ total: count() }).from(aiConversations).where(gte(aiConversations.createdAt, since)),
    db
      .select({ status: aiSafetyAlerts.status, level: aiSafetyAlerts.level, total: count() })
      .from(aiSafetyAlerts)
      .where(gte(aiSafetyAlerts.createdAt, since))
      .groupBy(aiSafetyAlerts.status, aiSafetyAlerts.level),
    db
      .select({ type: usageEvents.type, total: count(), sum: sql<number>`coalesce(sum((${usageEvents.meta}->>'count')::int), 0)`.mapWith(Number) })
      .from(usageEvents)
      .where(events(["ai_handoff_shown", "ai_handoff_sent", "ai_resources_shown"]))
      .groupBy(usageEvents.type),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${aiMessages.createdAt}), 'YYYY-MM-DD')`,
        messages: count(),
        members: sql<number>`count(distinct ${aiMessages.userId})`.mapWith(Number),
      })
      .from(aiMessages)
      .where(memberMessages)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    // "Resolved without a person": answered conversations with no alert and no hand-off card.
    db
      .select({ total: sql<number>`count(distinct ${aiConversations.id})`.mapWith(Number) })
      .from(aiConversations)
      .where(
        and(
          gte(aiConversations.createdAt, since),
          sql`exists (select 1 from ${aiMessages} m where m.conversation_id = ${aiConversations.id} and m.role = 'assistant' and m.outcome = 'answered')`,
          sql`not exists (select 1 from ${aiSafetyAlerts} a where a.conversation_id = ${aiConversations.id})`,
          sql`not exists (select 1 from ${aiMessages} m where m.conversation_id = ${aiConversations.id} and m.cards ? 'handoff')`,
        ),
      ),
  ]);

  const event = (type: string) => eventRows.find((row) => row.type === type);
  return {
    days,
    members: messageTotals?.members ?? 0,
    conversations: conversationTotals?.total ?? 0,
    memberMessages: messageTotals?.messages ?? 0,
    voiceMessages: messageTotals?.voice ?? 0,
    helpful: replyTotals?.helpful ?? 0,
    notHelpful: replyTotals?.notHelpful ?? 0,
    fallbacks: replyTotals?.fallbacks ?? 0,
    alerts: {
      open: alertRows.filter((row) => row.status !== "resolved").reduce((sum, row) => sum + row.total, 0),
      total: alertRows.reduce((sum, row) => sum + row.total, 0),
      urgent: alertRows.filter((row) => row.level === "urgent").reduce((sum, row) => sum + row.total, 0),
    },
    handoffsShown: event("ai_handoff_shown")?.total ?? 0,
    handoffsSent: event("ai_handoff_sent")?.total ?? 0,
    resourcesShown: event("ai_resources_shown")?.sum ?? 0,
    resolvedWithoutHuman: resolved?.total ?? 0,
    avgLatencyMs: replyTotals?.avgLatency ?? null,
    tokens: { input: replyTotals?.input ?? 0, output: replyTotals?.output ?? 0 },
    daily,
  };
}
