import "server-only";
import { eq, sql } from "drizzle-orm";
import { audit } from "@/features/admin/audit";
import { db } from "@/server/db/client";
import { profiles, smsInbound, type SmsInboundKind } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { normalizePhone } from "./phone";

/** Carrier-standard keywords (Twilio's defaults). */
const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START = new Set(["START", "YES", "UNSTOP", "OPTIN"]);
const HELP = new Set(["HELP", "INFO"]);

export function classifyInbound(body: string): SmsInboundKind {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP.has(word)) return "stop";
  if (START.has(word)) return "start";
  if (HELP.has(word)) return "help";
  return "message";
}

/**
 * Stores a reply and honours opt-out/opt-in keywords on the matching
 * participant's profile (the weekly program skips people who opted out).
 * Twilio itself answers STOP/HELP on long codes.
 */
export async function handleInboundSms(input: { from: string; body: string; messageSid?: string }) {
  const from = normalizePhone(input.from) ?? input.from;
  const kind = classifyInbound(input.body);
  const [profile] = await db
    .select({ id: profiles.id, userId: profiles.userId, smsOptOut: profiles.smsOptOut })
    .from(profiles)
    .where(eq(profiles.phone, from))
    .limit(1);
  const inserted = await db
    .insert(smsInbound)
    .values({
      from,
      userId: profile?.userId ?? null,
      body: input.body.slice(0, 1600),
      kind,
      messageSid: input.messageSid || null,
    })
    // Twilio retries: a duplicate MessageSid means we already handled it.
    .onConflictDoNothing({ target: smsInbound.messageSid, where: sql`${smsInbound.messageSid} is not null` })
    .returning({ id: smsInbound.id });
  if (!inserted.length) return { kind, duplicate: true };
  if (profile && (kind === "stop" || kind === "start")) {
    const optOut = kind === "stop";
    if (profile.smsOptOut !== optOut) {
      await db.update(profiles).set({ smsOptOut: optOut }).where(eq(profiles.id, profile.id));
      await audit({
        actor: null,
        action: "sms.optout",
        targetIds: [profile.userId],
        summary: optOut ? "Opted out of study texts by replying STOP" : "Opted back in to study texts by replying START",
      });
    }
  }
  logger.info({ kind, matched: Boolean(profile) }, "inbound sms");
  return { kind, duplicate: false };
}
