import twilio from "twilio";
import { env } from "@/env";
import { handleInboundSms } from "@/features/sms/inbound";
import { logger } from "@/server/logger";

/**
 * Twilio "A message comes in" webhook for the study number. Configure it in
 * Twilio as POST {APP_URL}/api/sms/inbound. Requests must carry a valid
 * Twilio signature (outside production, unsigned requests are accepted when
 * no auth token is configured, for local testing).
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") params[key] = value;

  if (env.TWILIO_AUTH_TOKEN) {
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const url = new URL("/api/sms/inbound", env.NEXT_PUBLIC_APP_URL).toString();
    if (!twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params)) {
      logger.warn("inbound sms with an invalid signature");
      return new Response("Forbidden", { status: 403 });
    }
  } else if (env.NODE_ENV === "production") {
    return new Response("Not configured", { status: 503 });
  }

  const from = params.From ?? "";
  if (!from) return new Response("Bad request", { status: 400 });
  await handleInboundSms({ from, body: params.Body ?? "", messageSid: params.MessageSid });
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
