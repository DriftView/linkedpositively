import "server-only";
import { env } from "@/env";
import { logger } from "@/server/logger";

/**
 * Is ElevenLabs working? When it runs out of credits, rejects the key or stops
 * answering, the coach's voice is skipped for a few minutes (the browser reads
 * replies straight away instead of every sentence waiting on a failed call),
 * then tried again. Kept per server instance; the admin banner also asks
 * ElevenLabs for the account's credits (getVoiceHealth).
 */

export type VoiceOutageReason = "out_of_credits" | "rejected_key" | "unavailable";

const COOLDOWN_MS: Record<VoiceOutageReason, number> = {
  out_of_credits: 10 * 60_000,
  rejected_key: 10 * 60_000,
  unavailable: 2 * 60_000,
};
/** Network errors and 5xx in a row before ElevenLabs counts as down (one blip isn't an outage). */
const TRANSIENT_LIMIT = 2;

const state = {
  reason: null as VoiceOutageReason | null,
  since: 0,
  until: 0,
  transient: 0,
};

/** True while ElevenLabs is being skipped. */
export function elevenLabsDown() {
  return Date.now() < state.until;
}

/** What went wrong, from an ElevenLabs error response (or null for a network error or timeout). */
export function classifyFailure(status: number | null, body = ""): VoiceOutageReason | "ignore" | "transient" {
  if (status === null || status >= 500) return "transient";
  if (status === 402) return "out_of_credits";
  if (status === 401 || status === 403)
    return /quota_exceeded|insufficient|credit/i.test(body) ? "out_of_credits" : "rejected_key";
  // 429 (too many requests at once) and other 4xx (a bad request: our bug) aren't outages.
  return "ignore";
}

function markDown(reason: VoiceOutageReason) {
  const now = Date.now();
  if (state.reason !== reason || now >= state.until) {
    state.since = now;
    logger.warn({ reason }, "elevenlabs marked unavailable");
  }
  state.reason = reason;
  state.until = now + COOLDOWN_MS[reason];
}

/** Records a failed ElevenLabs call. Pass the response when there is one. */
export async function reportElevenLabsFailure(response: Response | null) {
  const body = response ? await response.text().catch(() => "") : "";
  const kind = classifyFailure(response?.status ?? null, body);
  if (kind === "ignore") return;
  if (kind === "transient") {
    if (++state.transient >= TRANSIENT_LIMIT) markDown("unavailable");
    return;
  }
  markDown(kind);
}

/** Records a working ElevenLabs call: any outage is over. */
export function reportElevenLabsSuccess() {
  state.transient = 0;
  if (state.reason && !elevenLabsDown()) state.reason = null;
}

/** Test helper. */
export function resetVoiceStatus() {
  Object.assign(state, { reason: null, since: 0, until: 0, transient: 0 });
}

// ---------------------------------------------------------------------------
// Admin banner
// ---------------------------------------------------------------------------

export type VoiceHealth = {
  /** ElevenLabs is being skipped on this server right now. */
  outage: { reason: VoiceOutageReason; since: Date } | null;
  /** The account's credits this billing period (null: couldn't check). */
  credits: {
    used: number;
    limit: number;
    resetsAt: Date | null;
    /** Usage-based billing is on: credits never run out, they're billed as overage. */
    payAsYouGo: boolean;
  } | null;
  /** Why the credits couldn't be checked. */
  creditsError: string | null;
};

const HEALTH_TTL_MS = 5 * 60_000;
let cached: { at: number; credits: VoiceHealth["credits"]; creditsError: string | null } | null = null;

type SubscriptionResponse = {
  character_count?: number;
  character_limit?: number;
  next_character_count_reset_unix?: number | null;
  max_credit_limit_extension?: number | "unlimited";
};

async function checkCredits(): Promise<Pick<VoiceHealth, "credits" | "creditsError">> {
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY! },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (response.status === 401)
      return { credits: null, creditsError: "The API key can't read the account (give it the User: Read permission)." };
    if (!response.ok) {
      if (response.status >= 500) markDown("unavailable");
      return { credits: null, creditsError: `ElevenLabs didn't answer (status ${response.status}).` };
    }
    const data = (await response.json()) as SubscriptionResponse;
    if (typeof data.character_count !== "number" || typeof data.character_limit !== "number")
      return { credits: null, creditsError: "ElevenLabs sent an unexpected answer." };
    return {
      credits: {
        used: data.character_count,
        limit: data.character_limit,
        resetsAt: data.next_character_count_reset_unix ? new Date(data.next_character_count_reset_unix * 1000) : null,
        payAsYouGo: data.max_credit_limit_extension === "unlimited" || (data.max_credit_limit_extension ?? 0) > 0,
      },
      creditsError: null,
    };
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "elevenlabs subscription check failed");
    return { credits: null, creditsError: "ElevenLabs couldn't be reached." };
  }
}

/** ElevenLabs' state for the admin banner, or null when it isn't configured. Credits are checked every 5 minutes at most. */
export async function getVoiceHealth(): Promise<VoiceHealth | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  if (!cached || Date.now() - cached.at > HEALTH_TTL_MS) cached = { at: Date.now(), ...(await checkCredits()) };
  return {
    outage: elevenLabsDown() && state.reason ? { reason: state.reason, since: new Date(state.since) } : null,
    credits: cached.credits,
    creditsError: cached.creditsError,
  };
}
