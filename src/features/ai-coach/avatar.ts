import "server-only";
import { env } from "@/env";
import { logger } from "@/server/logger";

/**
 * The video coach (Anam): a photoreal face lip-synced to the coach's
 * ElevenLabs voice. Anam only draws the face. Its "audio passthrough" mode
 * renders the audio we send, so Claude, the safety layers and the voice stay
 * ours. The browser gets a short-lived session token; the API key stays here.
 */

const SESSION_TOKEN_URL = "https://api.anam.ai/v1/auth/session-token";
/** Anam's current real-time avatar model. */
const AVATAR_MODEL = "cara-4";

export function videoConfigured() {
  return Boolean(env.ANAM_API_KEY && env.ANAM_AVATAR_ID);
}

/** A session token for one video call, or null when Anam is unavailable. */
export async function createAvatarSession(): Promise<string | null> {
  if (!env.ANAM_API_KEY || !env.ANAM_AVATAR_ID) return null;
  try {
    const response = await fetch(SESSION_TOKEN_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.ANAM_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        personaConfig: { avatarId: env.ANAM_AVATAR_ID, avatarModel: AVATAR_MODEL, enableAudioPassthrough: true },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "anam session token failed");
      return null;
    }
    const body = (await response.json()) as { sessionToken?: string };
    return body.sessionToken ?? null;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "anam session token failed");
    return null;
  }
}
