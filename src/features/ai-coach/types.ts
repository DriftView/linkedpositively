import type { AiAlertCategory, AiAlertLevel, AiAlertSource, AiAlertStatus, AiCards, AiCoachLook, AiOutcome, AiRiskLevel, AiTopic } from "@/server/db/schema/ai";

/** Client-safe DTOs and the chat stream protocol of the AI Coach. */

export type { AiCards };

export type ConversationSummaryDTO = { id: string; title: string; lastMessageAt: string; messageCount: number };

export type ChatMessageDTO = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: AiCards | null;
  feedback: 1 | -1 | null;
  outcome: AiOutcome | null;
  createdAt: string;
};

export type AiPreferencesDTO = { personalize: boolean; autoSpeak: boolean; look: AiCoachLook };

/**
 * Events streamed from POST /api/ai/chat, one JSON object per line (NDJSON).
 * `text` deltas build the reply; `cards` merge into it; `done` carries the
 * stored reply.
 */
export type AiStreamEvent =
  | { type: "start"; conversationId: string; userMessageId: string; title: string }
  | { type: "text"; delta: string }
  | { type: "status"; label: string }
  | { type: "cards"; cards: AiCards }
  | { type: "safety"; level: "elevated" | "urgent"; category: string }
  | { type: "done"; message: ChatMessageDTO }
  | { type: "error"; message: string };

export type AlertRowDTO = {
  id: string;
  level: AiAlertLevel;
  category: AiAlertCategory;
  source: AiAlertSource;
  status: AiAlertStatus;
  reason: string;
  member: { id: string; name: string; username: string };
  conversationId: string | null;
  handledByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlertDetailDTO = AlertRowDTO & {
  staffNote: string;
  messageId: string | null;
  coachName: string | null;
  transcript: { id: string; role: "user" | "assistant"; text: string; risk: AiRiskLevel; createdAt: string }[];
};

export type ArticleRowDTO = {
  id: string;
  title: string;
  topic: AiTopic;
  published: boolean;
  needsReview: boolean;
  updatedAt: string;
};

export type ArticleFormDTO = {
  id: string | null;
  title: string;
  topic: AiTopic;
  body: string;
  sourceUrl: string;
  published: boolean;
  needsReview: boolean;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type AiStatsDTO = {
  days: number;
  members: number;
  conversations: number;
  memberMessages: number;
  voiceMessages: number;
  helpful: number;
  notHelpful: number;
  fallbacks: number;
  alerts: { open: number; total: number; urgent: number };
  handoffsShown: number;
  handoffsSent: number;
  resourcesShown: number;
  resolvedWithoutHuman: number;
  avgLatencyMs: number | null;
  tokens: { input: number; output: number };
  daily: { day: string; messages: number; members: number }[];
};
