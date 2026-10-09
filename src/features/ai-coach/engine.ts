import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getSettings } from "@/features/admin/settings";
import { getMyCoach } from "@/features/peer-nav/queries";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  aiConversations,
  aiMessages,
  profiles,
  type AiCards,
  type AiOutcome,
  type AiRiskLevel,
} from "@/server/db/schema";
import { logger } from "@/server/logger";
import { trackUsage } from "@/server/services/usage";
import { classifyRisk } from "./classifier";
import { AI_MODEL, aiConfigured, claude, FALLBACK_BETA } from "./claude";
import { HOURLY_MESSAGE_LIMIT, MAX_TURNS_PER_CONVERSATION } from "./constants";
import { raiseAlert } from "./escalation";
import { searchKnowledge } from "./knowledge";
import { getPreferences } from "./queries";
import { resolveCoach } from "./coach-design";
import { buildMemberContext, buildPersona, conversationTitle, SYSTEM_PROMPT } from "./prompt";
import { detectKeywordRisk, maxRisk, riskRank } from "./safety";
import { runTool, TOOLS, type ToolContext } from "./tools";
import type { AiStreamEvent, ChatMessageDTO } from "./types";

/**
 * One AI Coach turn: the member's message in, a streamed reply out.
 *
 *  1. Save the member's message; run the keyword safety check (instant) and
 *     the Claude safety classifier (in parallel with the reply).
 *  2. Replay the stored conversation (append-only, thinking blocks and tool
 *     calls included) and stream Claude's reply, running its tools
 *     (knowledge search, resource locator, navigator hand-off, human alert).
 *  3. Save the reply with its cards and outcome.
 *
 * Every failure ends in a defined fallback reply (docs/AI_COACH.md "Fallbacks").
 */

const MAX_TOOL_ROUNDS = 6;
const CLASSIFIER_HISTORY = 4;

export class ChatError extends Error {}

export type ChatInput = {
  viewer: Viewer;
  conversationId: string | null;
  text: string;
  near: string | null;
  viaVoice: boolean;
  handsFree?: boolean;
  emit: (event: AiStreamEvent) => void;
};

const FALLBACK_TEXT: Record<Exclude<AiOutcome, "answered">, string> = {
  fallback_unavailable:
    "I'm not able to answer right now, but you're not on your own. Here's approved Link Positively content that may help. You can also reach your peer navigator or the study team, and if you're in danger, call 911 or call or text 988.",
  fallback_error:
    "Sorry, something went wrong on my side and I couldn't finish that answer. Please try again in a moment. Here's related Link Positively content in the meantime. If you're in danger, call 911 or call or text 988.",
  fallback_refusal:
    "I'm not able to help with that one, and I'm sorry. Your peer navigator or the study team can help you find the right support. If you're in danger, call 911 or call or text 988.",
  fallback_limit:
    "We've talked a lot in the last hour, so I'm going to take a short break. Please come back a little later. If you need help now, your peer navigator or the study team can help, and if you're in danger, call 911 or call or text 988.",
};

/** Used instead of the other fallbacks when the safety layer flagged this conversation. */
const CRISIS_FALLBACK_TEXT =
  "Thank you for telling me. I can't chat properly right now, but your safety matters and you don't have to handle this alone. If you're in danger right now, call 911. You can call or text 988 any time, day or night, or text HOME to 741741. The study team has been asked to check in with you.";

const LONG_CONVERSATION_TEXT =
  "This conversation has gotten long, so please start a new one with the New chat button. I'll be right here. If you need help now and you're in danger, call 911 or call or text 988.";

export async function runChatTurn(input: ChatInput): Promise<void> {
  const { viewer, emit } = input;
  const started = Date.now();
  const settings = await getSettings();
  if (!settings.aiCoachEnabled) throw new ChatError("The AI Coach is switched off right now.");

  // Conversation (owned by the viewer, not hidden).
  let conversationId = input.conversationId;
  let title = conversationTitle(input.text);
  let turnCount = 0;
  if (conversationId) {
    const [conversation] = await db
      .select({ id: aiConversations.id, title: aiConversations.title })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.userId, viewer.id),
          isNull(aiConversations.hiddenAt),
        ),
      )
      .limit(1);
    if (!conversation) throw new ChatError("That conversation isn't available. Start a new one.");
    title = conversation.title;
    const [{ turns }] = await db
      .select({ turns: count() })
      .from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.role, "user")));
    turnCount = turns;
  }

  // Facts about the member (the member context note, the tools).
  const [preferences, [profile], navigator] = await Promise.all([
    getPreferences(viewer.id),
    db
      .select({ firstName: profiles.firstName, pronouns: profiles.pronouns, location: profiles.location })
      .from(profiles)
      .where(eq(profiles.userId, viewer.id))
      .limit(1),
    can(viewer, "peernav.participant") ? getMyCoach(viewer.id) : Promise.resolve(null),
  ]);

  const isNew = !conversationId;
  if (!conversationId) {
    const [created] = await db
      .insert(aiConversations)
      .values({ userId: viewer.id, title })
      .returning({ id: aiConversations.id });
    conversationId = created.id;
  }
  const keyword = detectKeywordRisk(input.text);
  const memberContext = isNew
    ? buildMemberContext({
        personalize: preferences.personalize,
        firstName: profile?.firstName || viewer.name.split(" ")[0] || null,
        pronouns: profile?.pronouns || null,
        location: profile?.location || null,
        timezone: viewer.timezone,
        linkPositively: can(viewer, "lp.access") && can(viewer, "tips.view"),
        peerNavigation: can(viewer, "peernav.participant"),
        navigatorName: navigator ? navigator.firstName || navigator.name : null,
        today: new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: viewer.timezone,
        }).format(new Date()),
      })
    : null;
  const userParam: Anthropic.Beta.BetaMessageParam = memberContext
    ? {
        role: "user",
        content: [
          { type: "text", text: memberContext },
          { type: "text", text: input.text },
        ],
      }
    : { role: "user", content: input.text };

  const [userMessage] = await db
    .insert(aiMessages)
    .values({
      conversationId,
      userId: viewer.id,
      role: "user",
      text: input.text,
      apiMessages: [userParam],
      risk: keyword?.level ?? "none",
      riskCategory: keyword?.category ?? null,
      viaVoice: input.viaVoice,
    })
    .returning({ id: aiMessages.id });
  emit({ type: "start", conversationId, userMessageId: userMessage.id, title });
  await trackUsage(viewer.id, "ai_message", {
    voice: input.viaVoice,
    handsFree: Boolean(input.handsFree),
    newConversation: isNew,
  });
  if (input.viaVoice) await trackUsage(viewer.id, "ai_voice_input");

  const cards: AiCards = {};
  const safety: { shown: AiRiskLevel } = { shown: "none" };
  const showSafety = (level: "elevated" | "urgent", category: string) => {
    if (riskRank(level) <= riskRank(safety.shown)) return;
    safety.shown = level;
    cards.crisis = { level, category };
    emit({ type: "safety", level, category });
  };

  // Safety layer 1: keywords, before anything else.
  if (keyword) {
    showSafety(keyword.level, keyword.category);
    await raiseAlert({
      userId: viewer.id,
      conversationId,
      messageId: userMessage.id,
      level: keyword.level,
      category: keyword.category,
      source: "keywords",
      reason: "Possible crisis wording in a member message.",
    });
  }

  // Safety layer 2: Claude classifier, in parallel with the reply.
  const classification = (async () => {
    const recent = await db
      .select({ text: aiMessages.text })
      .from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.role, "user")))
      .orderBy(sql`${aiMessages.createdAt} desc`)
      .limit(CLASSIFIER_HISTORY);
    const risk = await classifyRisk(recent.map((row) => row.text).reverse());
    if (!risk || risk.level === "none") return;
    const category = risk.category === "none" ? "other" : risk.category;
    const level = maxRisk<AiRiskLevel>(risk.level, keyword?.level ?? "none");
    await db
      .update(aiMessages)
      .set({ risk: level, riskCategory: keyword?.category ?? category })
      .where(eq(aiMessages.id, userMessage.id));
    if (risk.level === "support") return; // the coach offers people itself; no alert for a plain wish to talk
    showSafety(risk.level, category);
    await raiseAlert({
      userId: viewer.id,
      conversationId,
      messageId: userMessage.id,
      level: risk.level,
      category,
      source: "classifier",
      reason: risk.reason,
    });
  })().catch((error) =>
    logger.error({ err: error instanceof Error ? error.message : error }, "ai classification step failed"),
  );

  // Limits.
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.userId, viewer.id),
        eq(aiMessages.role, "user"),
        gte(aiMessages.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );

  const longConversation = turnCount >= MAX_TURNS_PER_CONVERSATION;
  let text = "";
  let outcome: AiOutcome = "answered";
  let turnMessages: Anthropic.Beta.BetaMessageParam[] = [];
  const usage = { input: 0, output: 0 };
  const emitText = (delta: string) => {
    text += delta;
    emit({ type: "text", delta });
  };

  if (recent > HOURLY_MESSAGE_LIMIT) {
    outcome = "fallback_limit";
  } else if (longConversation) {
    outcome = "fallback_limit";
  } else if (!aiConfigured()) {
    outcome = "fallback_unavailable";
  } else {
    const history = await loadHistory(conversationId, userMessage.id);
    const toolContext: ToolContext = {
      viewer,
      conversationId,
      userMessageId: userMessage.id,
      near: input.near,
      personalize: preferences.personalize,
      profileLocation: profile?.location || null,
      navigator: navigator ? { name: navigator.firstName || navigator.name } : null,
      studyContact: { email: settings.contactEmail, phone: settings.contactPhone },
      cards,
      emit,
      showSafety,
    };
    try {
      const coach = resolveCoach(preferences.design);
      const persona = buildPersona({
        name: coach.name,
        pronouns: coach.pronouns,
        tone: coach.tone,
        replyLength: coach.replyLength,
      });
      const result = await streamReply(history, userParam, toolContext, emitText, usage, persona);
      turnMessages = result.messages;
      if (result.refused) outcome = "fallback_refusal";
    } catch (error) {
      outcome = "fallback_error";
      const status = error instanceof Anthropic.APIError ? error.status : null;
      logger.error(
        { userId: viewer.id, status, err: error instanceof Error ? error.message : String(error) },
        "ai coach reply failed",
      );
    }
  }

  // The safety review must be on the record (and its card shown) before the reply is final.
  await classification;

  // Fallbacks: a defined reply (after any partial answer), related approved content, and a clean history entry.
  if (outcome !== "answered") {
    const inCrisis = safety.shown === "elevated" || safety.shown === "urgent";
    const fallback = longConversation
      ? LONG_CONVERSATION_TEXT
      : inCrisis && outcome !== "fallback_limit"
        ? CRISIS_FALLBACK_TEXT
        : FALLBACK_TEXT[outcome];
    emitText(text ? `\n\n${fallback}` : fallback);
    if (!inCrisis && (outcome === "fallback_unavailable" || outcome === "fallback_error")) {
      const hits = await searchKnowledge(viewer, input.text, 4).catch(() => []);
      if (hits.length) {
        cards.sources = hits.map((hit) => ({ kind: hit.kind, id: hit.id, title: hit.title, href: hit.href }));
        emit({ type: "cards", cards: { ...cards } });
      }
    }
    turnMessages = [{ role: "assistant", content: [{ type: "text", text }] }];
    await trackUsage(viewer.id, "ai_fallback", { outcome });
  }

  const [saved] = await db
    .insert(aiMessages)
    .values({
      conversationId,
      userId: viewer.id,
      role: "assistant",
      text,
      apiMessages: turnMessages,
      cards: Object.keys(cards).length ? cards : null,
      outcome,
      model: outcome === "answered" || outcome === "fallback_refusal" ? AI_MODEL : null,
      inputTokens: usage.input || null,
      outputTokens: usage.output || null,
      latencyMs: Date.now() - started,
    })
    .returning({ id: aiMessages.id, createdAt: aiMessages.createdAt });
  await db
    .update(aiConversations)
    .set({ messageCount: sql`${aiConversations.messageCount} + 2`, lastMessageAt: new Date() })
    .where(eq(aiConversations.id, conversationId));

  const message: ChatMessageDTO = {
    id: saved.id,
    role: "assistant",
    text,
    cards: Object.keys(cards).length ? cards : null,
    feedback: null,
    outcome,
    createdAt: saved.createdAt.toISOString(),
  };
  emit({ type: "done", message });
}

/** The conversation so far as Messages API history (every stored turn, in order, unchanged). */
async function loadHistory(conversationId: string, excludeId: string) {
  const rows = await db
    .select({ id: aiMessages.id, apiMessages: aiMessages.apiMessages })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt), desc(aiMessages.role));
  return rows
    .filter((row) => row.id !== excludeId)
    .flatMap((row) => row.apiMessages as Anthropic.Beta.BetaMessageParam[]);
}

type ReplyResult = { messages: Anthropic.Beta.BetaMessageParam[]; refused: boolean };

/** Streams Claude's reply, running tools until it is done. Returns this turn's messages (append-only). Exported for tests. */
export async function streamReply(
  history: Anthropic.Beta.BetaMessageParam[],
  userParam: Anthropic.Beta.BetaMessageParam,
  ctx: ToolContext,
  emitText: (delta: string) => void,
  usage: { input: number; output: number },
  /** The member's coach design (buildPersona), after the cached system prompt. */
  persona?: string,
): Promise<ReplyResult> {
  const turn: Anthropic.Beta.BetaMessageParam[] = [userParam];
  let wroteText = false;
  let jsonRetries = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    const stream = claude().beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium" },
      // The system prompt and tool list are identical for every member: cached.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ...(persona ? [{ type: "text" as const, text: persona }] : []),
      ],
      tools: TOOLS,
      // Also caches the conversation so far, so each round only pays for what's new.
      cache_control: { type: "ephemeral" },
      ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
      messages: [...history, ...turn],
    });

    let roundStarted = false;
    stream.on("text", (delta) => {
      if (!roundStarted && wroteText) emitText("\n\n");
      roundStarted = true;
      wroteText = true;
      emitText(delta);
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (error) {
      // A tool input that isn't valid JSON (eager input streaming): re-issue the round, a couple of times at most.
      if (error instanceof Anthropic.APIError || jsonRetries++ >= 2 || roundStarted) throw error;
      round--;
      continue;
    }
    usage.input +=
      (message.usage.input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0);
    usage.output += message.usage.output_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      // Never store a refused turn: the fallback reply replaces it.
      return { messages: [], refused: true };
    }

    turn.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      // A tool call cut off mid-input: never run it, and never store a tool call without its result.
      turn.pop();
      throw new Error("reply cut off during a tool call");
    }
    if (message.stop_reason !== "tool_use" || !toolUses.length) break;

    const results = await Promise.all(
      toolUses.map(async (toolUse): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          const outcome = await runTool(toolUse.name, toolUse.input, ctx);
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: outcome.content,
            ...(outcome.isError ? { is_error: true } : {}),
          };
        } catch (error) {
          logger.error(
            { tool: toolUse.name, err: error instanceof Error ? error.message : String(error) },
            "ai tool failed",
          );
          return {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "This tool is unavailable right now.",
            is_error: true,
          };
        }
      }),
    );
    if (ctx.cards.resources || ctx.cards.sources || ctx.cards.handoff)
      ctx.emit({ type: "cards", cards: { ...ctx.cards } });
    turn.push({ role: "user", content: results });
  }

  // The member's message is stored separately; this turn is everything after it.
  return { messages: turn.slice(1), refused: false };
}
