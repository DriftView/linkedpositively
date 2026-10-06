import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";

/** The model behind the AI Coach and its safety classifier. */
export const AI_MODEL = "claude-opus-5-5";

/**
 * Server-side refusal fallback: if Claude's safety classifiers decline a
 * request, the API re-runs it on Anthropic's recommended fallback model
 * instead of returning a refusal (beta `server-side-fallback-2026-07-01`).
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

/** True when the server has an Anthropic API key. Without one the coach runs in fallback mode. */
export function aiConfigured() {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function claude() {
  // Short timeout and one retry: a member is waiting, and the fallback reply is better than a long spinner.
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}
