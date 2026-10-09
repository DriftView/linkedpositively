import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AI_ALERT_CATEGORIES } from "@/server/db/schema/ai";
import { logger } from "@/server/logger";
import { AI_MODEL, aiConfigured, claude } from "./claude";

/**
 * Second line of the safety layer: Claude reads the member's latest messages
 * and rates the risk, in parallel with the coach's reply. Catches what the
 * keyword check (safety.ts) misses: indirect wording, slang, context spread
 * over several messages. Returns null when it can't decide (no key, timeout,
 * API error); the keyword check and the coach's own protocol still apply.
 */

const RiskSchema = z.object({
  level: z.enum(["none", "support", "elevated", "urgent"]),
  category: z.enum([...AI_ALERT_CATEGORIES, "none"]),
  reason: z.string(),
});
export type ClassifiedRisk = z.infer<typeof RiskSchema>;

const INSTRUCTIONS = `You are the safety reviewer for a health and peer-support app used by young people, many LGBTQ+, some living with HIV. Read the member's recent messages to an AI coach and rate the risk in the LATEST message, using earlier messages only as context.

Levels:
- urgent: danger to life or health now or very soon: suicidal intent or plan, a suicide attempt, an overdose, intent to seriously hurt someone, a medical emergency, ongoing assault, or a child or teen in danger.
- elevated: serious risk that is not immediate: thoughts of suicide or wanting to die without a plan, self-harm, abuse or violence at home or from a partner, recent sexual assault, being unsafe where they live, or a possible HIV exposure in the last 72 hours (use category "medical").
- support: no danger, but the member asks for a human, says they are struggling or overwhelmed, or needs help an app cannot give.
- none: everything else, including general questions about HIV, PrEP, PEP, testing, sex, drugs or mental health asked for information.

Be careful: questions about these topics are not risk by themselves, and common expressions ("this is killing me", "I'm dying to know") are not risk. When unsure between two levels, choose the higher one.
category: the best match, or "none" for level none. reason: one short neutral sentence for staff, without quoting the member.`;

/** Rates the latest of `recentMessages` (oldest first). Never throws. */
export async function classifyRisk(
  recentMessages: string[],
  options: { timeoutMs?: number } = {},
): Promise<ClassifiedRisk | null> {
  if (!aiConfigured() || !recentMessages.length) return null;
  const transcript = recentMessages
    .map(
      (text, index) => `<message${index === recentMessages.length - 1 ? ' latest="true"' : ""}>\n${text}\n</message>`,
    )
    .join("\n");
  try {
    const response = await claude().messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(RiskSchema) },
        system: INSTRUCTIONS,
        messages: [{ role: "user", content: `<recent_messages>\n${transcript}\n</recent_messages>` }],
      },
      { timeout: options.timeoutMs ?? 20_000, maxRetries: 0 },
    );
    if (response.stop_reason === "refusal") {
      // A refusal on a safety review almost always means alarming content: treat it as elevated.
      return { level: "elevated", category: "other", reason: "The safety check could not review this message." };
    }
    return response.parsed_output ?? null;
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status : null;
    logger.warn({ status, err: error instanceof Error ? error.message : String(error) }, "ai safety classifier failed");
    return null;
  }
}
