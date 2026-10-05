import "server-only";
import twilio from "twilio";
import { env } from "@/env";
import { logger } from "@/server/logger";

export type SmsResult = { ok: true; sid: string } | { ok: false; error: string };

let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  client ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client;
}

/**
 * Sends one SMS, or MMS when `mediaUrl` is given. With DELIVERY_MODE=log
 * nothing leaves the server: the message is only logged (without the number).
 */
export async function sendSms(input: { to: string; body: string; mediaUrl?: string; ref?: string }): Promise<SmsResult> {
  if (env.DELIVERY_MODE !== "live") {
    // Message bodies stay out of production logs (they can carry names and links).
    const preview = env.NODE_ENV === "production" ? undefined : input.body;
    logger.info({ ref: input.ref, length: input.body.length, preview }, "sms (log mode, not sent)");
    return { ok: true, sid: `log-${Date.now()}` };
  }

  const twilioClient = getClient();
  if (!twilioClient || !env.TWILIO_FROM_NUMBER) return { ok: false, error: "Twilio is not configured" };

  try {
    const message = await twilioClient.messages.create({
      to: input.to,
      from: env.TWILIO_FROM_NUMBER,
      body: input.body,
      ...(input.mediaUrl ? { mediaUrl: [input.mediaUrl] } : {}),
    });
    return { ok: true, sid: message.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Twilio error";
    // Twilio messages can quote the phone number: log the error code only.
    logger.error({ ref: input.ref, code: (error as { code?: number }).code ?? null }, "sms failed");
    return { ok: false, error: message };
  }
}
