import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, enumCheck, id, timestamps, tstz, tsvector } from "./_shared";
import { users } from "./auth";

/**
 * AI Coach: conversations with the Claude-powered assistant, the safety
 * alerts it raises, staff-approved knowledge articles it answers from, and
 * each member's AI preferences. Spec: docs/AI_COACH.md.
 */

/**
 * One conversation with the AI Coach. Kept for the study (never purged);
 * "Clear" in the app only sets `hiddenAt`, which hides it from the member.
 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Short title from the first question. */
    title: text().notNull().default("New conversation"),
    messageCount: integer().notNull().default(0),
    lastMessageAt: tstz().notNull().defaultNow(),
    /** Hidden by the member ("Clear conversation"). The record stays for the study team. */
    hiddenAt: tstz(),
    ...timestamps(),
  },
  (t) => [
    index("ai_conversations_user_hidden_last_idx").on(t.userId, t.hiddenAt, t.lastMessageAt.desc()),
    index("ai_conversations_created_idx").on(t.createdAt.desc()),
  ],
);

export const AI_ROLES = ["user", "assistant"] as const;
export type AiRole = (typeof AI_ROLES)[number];

export const AI_RISK_LEVELS = ["none", "support", "elevated", "urgent"] as const;
export type AiRiskLevel = (typeof AI_RISK_LEVELS)[number];

/** What a reply ended as: a normal answer, or one of the fallbacks (docs/AI_COACH.md "Fallbacks"). */
export const AI_OUTCOMES = [
  "answered",
  "fallback_unavailable",
  "fallback_refusal",
  "fallback_error",
  "fallback_limit",
] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

/** Cards shown under an assistant reply (resources, sources, a navigator hand-off, crisis lines). */
export type AiCards = {
  resources?: {
    id: string;
    title: string;
    address: string;
    phone: string;
    website: string;
    distanceMiles: number | null;
    href: string | null;
    mapsHref: string | null;
  }[];
  sources?: { kind: "tip" | "page" | "glossary" | "article"; id: string; title: string; href: string | null }[];
  handoff?: {
    kind: "navigator" | "study_team";
    coachName: string | null;
    draft: string;
    href: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  crisis?: { level: "elevated" | "urgent"; category: string };
};

/**
 * One turn in a conversation. `apiMessages` holds the exact Messages API
 * history the turn produced (for an assistant turn: every assistant and
 * tool-result message, thinking blocks included), so the conversation is
 * replayed append-only. `text` is what the member saw.
 */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().$type<AiRole>().notNull(),
    text: text().notNull().default(""),
    apiMessages: jsonb().$type<unknown[]>().notNull().default([]),
    cards: jsonb().$type<AiCards>(),
    /** Highest risk seen for this turn (user turns: the safety check of the message). */
    risk: text().$type<AiRiskLevel>().notNull().default("none"),
    riskCategory: text(),
    /** Asked by voice (user turns). */
    viaVoice: boolean().notNull().default(false),
    outcome: text().$type<AiOutcome>(),
    model: text(),
    inputTokens: integer(),
    outputTokens: integer(),
    latencyMs: integer(),
    /** Member feedback on an assistant reply: 1 helpful, -1 not helpful. */
    feedback: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("ai_messages_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("ai_messages_created_idx").on(t.createdAt.desc()),
    enumCheck("ai_messages_role_ck", t.role, AI_ROLES),
    enumCheck("ai_messages_risk_ck", t.risk, AI_RISK_LEVELS),
    enumCheck("ai_messages_outcome_ck", t.outcome, AI_OUTCOMES),
    check("ai_messages_feedback_ck", sql`${t.feedback} in (-1, 1)`),
  ],
);

export const AI_ALERT_CATEGORIES = [
  "suicide",
  "self_harm",
  "violence",
  "abuse",
  "overdose",
  "medical",
  "human_request",
  "other",
] as const;
export type AiAlertCategory = (typeof AI_ALERT_CATEGORIES)[number];

export const AI_ALERT_LEVELS = ["support", "elevated", "urgent"] as const;
export type AiAlertLevel = (typeof AI_ALERT_LEVELS)[number];

export const AI_ALERT_SOURCES = ["keywords", "classifier", "assistant"] as const;
export type AiAlertSource = (typeof AI_ALERT_SOURCES)[number];

export const AI_ALERT_STATUSES = ["open", "in_review", "resolved"] as const;
export type AiAlertStatus = (typeof AI_ALERT_STATUSES)[number];

/**
 * A conversation that needs a person: a possible crisis, or a member asking
 * for human help. One open alert per conversation; a later, more serious
 * signal raises its level. Staff work the queue at /admin/ai/alerts.
 */
export const aiSafetyAlerts = pgTable(
  "ai_safety_alerts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid().references(() => aiConversations.id, { onDelete: "set null" }),
    /** The member message that raised (or last raised) the alert. */
    messageId: uuid().references(() => aiMessages.id, { onDelete: "set null" }),
    level: text().$type<AiAlertLevel>().notNull(),
    category: text().$type<AiAlertCategory>().notNull(),
    source: text().$type<AiAlertSource>().notNull(),
    /** Short reason from the safety check or the assistant. No quotes from the member. */
    reason: text().notNull().default(""),
    status: text().$type<AiAlertStatus>().notNull().default("open"),
    staffNote: text(),
    handledBy: uuid().references(() => users.id, { onDelete: "set null" }),
    handledAt: tstz(),
    ...timestamps(),
  },
  (t) => [
    index("ai_safety_alerts_status_created_idx").on(t.status, t.createdAt.desc()),
    index("ai_safety_alerts_user_idx").on(t.userId),
    index("ai_safety_alerts_conversation_status_idx").on(t.conversationId, t.status),
    enumCheck("ai_safety_alerts_level_ck", t.level, AI_ALERT_LEVELS),
    enumCheck("ai_safety_alerts_category_ck", t.category, AI_ALERT_CATEGORIES),
    enumCheck("ai_safety_alerts_source_ck", t.source, AI_ALERT_SOURCES),
    enumCheck("ai_safety_alerts_status_ck", t.status, AI_ALERT_STATUSES),
  ],
);

export const AI_TOPICS = [
  "hiv",
  "prep",
  "pep",
  "testing",
  "treatment",
  "sexual_health",
  "mental_health",
  "trauma",
  "substance_use",
  "wellness",
  "other",
] as const;
export type AiTopic = (typeof AI_TOPICS)[number];

/**
 * Staff-approved knowledge written for the AI Coach (e.g. PrEP and PEP facts),
 * on top of the tips, pages and glossary it already searches. Only published
 * articles are used. Plain text; paragraphs separated by blank lines.
 */
export const aiKnowledgeArticles = pgTable(
  "ai_knowledge_articles",
  {
    id: id(),
    title: text().notNull(),
    topic: text().$type<AiTopic>().notNull().default("other"),
    body: text().notNull().default(""),
    /** Where the information comes from (CDC page, clinic guidance…), for reviewers. */
    sourceUrl: text(),
    published: boolean().notNull().default(false),
    /** Seeded or edited copy that the study team still needs to approve. */
    needsReview: boolean().notNull().default(true),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: tstz(),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Generated: never write it. Same weighting as tips.searchVector. */
    searchVector: tsvector().generatedAlwaysAs(
      sql`(setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'D'))`,
    ),
    ...timestamps(),
  },
  (t) => [
    index("ai_knowledge_articles_published_topic_idx").on(t.published, t.topic),
    index("ai_knowledge_articles_search_vector_gin").using("gin", t.searchVector),
    enumCheck("ai_knowledge_articles_topic_ck", t.topic, AI_TOPICS),
  ],
);

/** Starting looks for the coach (each one a preset appearance, name and voice). */
export const AI_COACH_LOOKS = ["amara", "jordan", "luis", "kai"] as const;
export type AiCoachLook = (typeof AI_COACH_LOOKS)[number];

/**
 * The coach a member designs. Every option is a fixed choice (no free-text
 * persona), so a design can change how the coach looks and sounds, never
 * what it is allowed to say. Labels and colors: features/ai-coach/coach-design.ts.
 */
export const AI_COACH_SKINS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"] as const;
export const AI_COACH_HAIRS = [
  "curls",
  "afro",
  "fade",
  "buzz",
  "waves",
  "long",
  "locs",
  "bun",
  "braids",
  "hijab",
  "bald",
] as const;
export const AI_COACH_HAIR_COLORS = [
  "black",
  "dark_brown",
  "brown",
  "auburn",
  "blonde",
  "gray",
  "plum",
  "teal",
] as const;
export const AI_COACH_FACIAL_HAIR = ["none", "stubble", "mustache", "beard"] as const;
export const AI_COACH_GLASSES = ["none", "round", "square"] as const;
export const AI_COACH_EARRINGS = ["none", "studs", "hoops"] as const;
export const AI_COACH_OUTFITS = ["tee", "hoodie", "collar"] as const;
export const AI_COACH_OUTFIT_COLORS = ["magenta", "sky", "apricot", "plum", "green", "charcoal"] as const;

export type AiCoachAppearance = {
  skin: (typeof AI_COACH_SKINS)[number];
  hair: (typeof AI_COACH_HAIRS)[number];
  hairColor: (typeof AI_COACH_HAIR_COLORS)[number];
  facialHair: (typeof AI_COACH_FACIAL_HAIR)[number];
  glasses: (typeof AI_COACH_GLASSES)[number];
  earrings: (typeof AI_COACH_EARRINGS)[number];
  outfit: (typeof AI_COACH_OUTFITS)[number];
  outfitColor: (typeof AI_COACH_OUTFIT_COLORS)[number];
};

export const AI_COACH_PRONOUNS = ["she", "he", "they"] as const;
export type AiCoachPronouns = (typeof AI_COACH_PRONOUNS)[number];

/** Vetted ElevenLabs voices (ids in coach-design.ts). Stored by key so a voice can be remapped. */
export const AI_COACH_VOICES = [
  "gentle",
  "lively",
  "upbeat",
  "relaxed",
  "easygoing",
  "warm",
  "deep",
  "british",
] as const;
export type AiCoachVoice = (typeof AI_COACH_VOICES)[number];

export const AI_COACH_TONES = ["warm", "upbeat", "calm", "direct"] as const;
export type AiCoachTone = (typeof AI_COACH_TONES)[number];

export const AI_REPLY_LENGTHS = ["brief", "balanced", "detailed"] as const;
export type AiReplyLength = (typeof AI_REPLY_LENGTHS)[number];

/** A member's AI Coach preferences. No row = the defaults. */
export const aiPreferences = pgTable(
  "ai_preferences",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** May the coach use profile context (first name, pronouns, location, program)? */
    personalize: boolean().notNull().default(true),
    /** Read replies aloud automatically. */
    autoSpeak: boolean().notNull().default(false),
    /** The starting look. Fills in anything the member hasn't designed (name, appearance, voice). */
    look: text().$type<AiCoachLook>().notNull().default("amara"),
    /** The member's name for the coach; null = the look's name. Letters, spaces, ' . - only. */
    coachName: text(),
    coachPronouns: text().$type<AiCoachPronouns>(),
    /** Null = the look's appearance. Validated on write (schemas.ts appearanceSchema). */
    appearance: jsonb().$type<AiCoachAppearance>(),
    /** Null = the look's voice. */
    voice: text().$type<AiCoachVoice>(),
    tone: text().$type<AiCoachTone>().notNull().default("warm"),
    replyLength: text().$type<AiReplyLength>().notNull().default("balanced"),
    ...timestamps(),
  },
  (t) => [
    enumCheck("ai_preferences_look_ck", t.look, AI_COACH_LOOKS),
    enumCheck("ai_preferences_coach_pronouns_ck", t.coachPronouns, AI_COACH_PRONOUNS),
    enumCheck("ai_preferences_voice_ck", t.voice, AI_COACH_VOICES),
    enumCheck("ai_preferences_tone_ck", t.tone, AI_COACH_TONES),
    enumCheck("ai_preferences_reply_length_ck", t.replyLength, AI_REPLY_LENGTHS),
  ],
);

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
export type AiSafetyAlert = typeof aiSafetyAlerts.$inferSelect;
export type NewAiSafetyAlert = typeof aiSafetyAlerts.$inferInsert;
export type AiKnowledgeArticle = typeof aiKnowledgeArticles.$inferSelect;
export type NewAiKnowledgeArticle = typeof aiKnowledgeArticles.$inferInsert;
export type AiPreference = typeof aiPreferences.$inferSelect;
export type NewAiPreference = typeof aiPreferences.$inferInsert;
