import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { env } from "@/env";
import { getSettings } from "@/features/admin/settings";
import { parseRoles } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import { profiles, smsClicks, smsSends, smsTemplates, users, type NewSmsSend } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { sendSms } from "@/server/services/sms";
import { trackUsage } from "@/server/services/usage";
import { DEFAULT_TEMPLATES, LINK_TOKEN, renderSmsBody, WELCOME_KEY, type DefaultTemplate } from "./program";
import { appUrl, safeInternalPath, shortUrl } from "./links";
import { cycleKey, planProgram } from "./schedule";

/** A due message is still sent this long after its slot (the job may have been down). */
export const SEND_GRACE_MS = 24 * 60 * 60 * 1000;
/** A claim older than this means the sender crashed mid-send. */
const STUCK_MS = 10 * 60 * 1000;
const BATCH = 200;

export type ProgramTemplate = DefaultTemplate & { active: boolean };

/** Current templates (stored ones over the built-in defaults). */
export async function getProgramTemplates(): Promise<Map<string, ProgramTemplate>> {
  const stored = await db
    .select({
      key: smsTemplates.key,
      week: smsTemplates.week,
      body: smsTemplates.body,
      linkPath: smsTemplates.linkPath,
      mediaPath: smsTemplates.mediaPath,
      active: smsTemplates.active,
    })
    .from(smsTemplates);
  const map = new Map<string, ProgramTemplate>(DEFAULT_TEMPLATES.map((template) => [template.key, { ...template, active: true }]));
  for (const row of stored) map.set(row.key, row);
  return map;
}

/**
 * Writes the participant's schedule for their current cycle (idempotent:
 * existing rows are kept as they are). Pending rows of an older cycle are
 * cancelled. Does nothing for people who aren't in the intervention arm.
 */
export async function ensureSchedule(userId: string) {
  const [[user], [profile]] = await Promise.all([
    db.select({ role: users.role, timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ interventionStartDate: profiles.interventionStartDate, roleChangedAt: profiles.roleChangedAt })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
  ]);
  if (!user || !profile?.interventionStartDate || !parseRoles(user.role ?? "").includes("participant")) return 0;
  const timezone = user.timezone || "America/New_York";
  const cycle = cycleKey(profile.interventionStartDate, timezone);

  await db
    .update(smsSends)
    .set({ status: "cancelled", reason: "restarted" })
    .where(and(eq(smsSends.userId, userId), eq(smsSends.status, "scheduled"), ne(smsSends.cycle, cycle)));

  const plan = planProgram({ userId, cycle, timezone, roleChangedAt: profile.roleChangedAt ?? null });
  const inserted = plan.length
    ? await db
        .insert(smsSends)
        .values(
          plan.map(
            (message): NewSmsSend => ({
              userId,
              flag: message.flag,
              week: message.week,
              cycle,
              scheduledFor: message.scheduledFor,
              timezone,
              status: "scheduled",
            }),
          ),
        )
        .onConflictDoNothing({ target: [smsSends.userId, smsSends.flag, smsSends.cycle] })
        .returning({ id: smsSends.id })
    : [];

  // Re-joining the intervention on the same start day: bring back texts that were
  // cancelled when they left, and move the welcome text to the new randomization time.
  const now = new Date();
  await db
    .update(smsSends)
    .set({ status: "scheduled", reason: null })
    .where(
      and(
        eq(smsSends.userId, userId),
        eq(smsSends.cycle, cycle),
        eq(smsSends.status, "cancelled"),
        inArray(smsSends.reason, ["left_intervention", "blocked", "restarted"]),
        gt(smsSends.scheduledFor, now),
      ),
    );
  if (profile.roleChangedAt && profile.roleChangedAt > now) {
    await db
      .update(smsSends)
      .set({ status: "scheduled", scheduledFor: profile.roleChangedAt, reason: null })
      .where(
        and(
          eq(smsSends.userId, userId),
          eq(smsSends.cycle, cycle),
          eq(smsSends.flag, WELCOME_KEY),
          inArray(smsSends.status, ["scheduled", "cancelled"]),
        ),
      );
  }
  return inserted.length;
}

/** Cancels every pending message of these participants (e.g. converted back to control). */
export async function cancelSchedule(userIds: string[], reason: string) {
  if (!userIds.length) return 0;
  const rows = await db
    .update(smsSends)
    .set({ status: "cancelled", reason })
    .where(and(inArray(smsSends.userId, userIds), eq(smsSends.status, "scheduled")))
    .returning({ id: smsSends.id });
  return rows.length;
}

/** Creates schedules for participants who have a start date but no rows for it (e.g. after the data migration). */
export async function reconcileSchedules() {
  const missing = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        sql`${users.role} ~ '(^|,)\\s*participant\\s*(,|$)'`,
        sql`${users.banned} is not true`,
        isNotNull(profiles.interventionStartDate),
        sql`not exists (select 1 from ${smsSends} where ${smsSends.userId} = ${profiles.userId} and ${smsSends.cycle} <> 'legacy')`,
      ),
    );
  let created = 0;
  for (const profile of missing) created += await ensureSchedule(profile.userId);
  return created;
}

type SendOutcome = "sent" | "failed" | "skipped" | "cancelled";

/** Sends one claimed message after re-checking that it should still go out. */
async function deliver(sendId: string, now: Date, options: { manual?: boolean } = {}): Promise<SendOutcome> {
  const [send] = await db.select().from(smsSends).where(eq(smsSends.id, sendId)).limit(1);
  if (!send) return "cancelled";
  const finish = async (status: SendOutcome, fields: Partial<NewSmsSend> = {}) => {
    await db
      .update(smsSends)
      .set(status === "sent" ? { status, reason: null, ...fields } : { status, ...fields })
      .where(and(eq(smsSends.id, send.id), eq(smsSends.status, "sending")));
    return status;
  };

  const [[user], [profile], templates, settings] = await Promise.all([
    db.select({ role: users.role, banned: users.banned, timezone: users.timezone }).from(users).where(eq(users.id, send.userId)).limit(1),
    db
      .select({ phone: profiles.phone, smsOptOut: profiles.smsOptOut, interventionStartDate: profiles.interventionStartDate })
      .from(profiles)
      .where(eq(profiles.userId, send.userId))
      .limit(1),
    getProgramTemplates(),
    getSettings(),
  ]);
  if (!user) return finish("cancelled", { reason: "no_account" });
  if (user.banned) return finish("cancelled", { reason: "blocked" });
  if (!parseRoles(user.role ?? "").includes("participant")) return finish("cancelled", { reason: "not_participant" });
  const timezone = user.timezone || "America/New_York";
  if (!profile?.interventionStartDate || cycleKey(profile.interventionStartDate, timezone) !== send.cycle) {
    return finish("cancelled", { reason: "restarted" });
  }
  if (!options.manual && send.scheduledFor.getTime() < now.getTime() - SEND_GRACE_MS) return finish("skipped", { reason: "missed_window" });
  if (send.flag === WELCOME_KEY && !settings.smsWelcomeEnabled && !options.manual) return finish("skipped", { reason: "welcome_off" });
  if (!profile.phone) return finish("skipped", { reason: "no_phone" });
  if (profile.smsOptOut) return finish("skipped", { reason: "opted_out" });

  const template = templates.get(send.flag);
  if (!template || !template.active) return finish("skipped", { reason: "template_off" });

  const linkPath = template.body.includes(LINK_TOKEN) && template.linkPath ? safeInternalPath(template.linkPath) : null;
  const body = renderSmsBody(template.body, linkPath ? shortUrl(send.id) : null);
  const mediaUrl = template.mediaPath ? appUrl(template.mediaPath) : undefined;

  const result = await sendSms({ to: profile.phone, body, mediaUrl, ref: `sms:${send.id}` });
  if (!result.ok) {
    return finish("failed", { reason: result.error.slice(0, 200), to: profile.phone, body, mediaUrl: mediaUrl ?? null, linkPath });
  }
  return finish("sent", {
    sentAt: new Date(),
    messageSid: result.sid,
    to: profile.phone,
    from: env.TWILIO_FROM_NUMBER ?? "",
    body,
    mediaUrl: mediaUrl ?? null,
    linkPath,
  });
}

/**
 * Sends every message whose time has come, exactly once: a row is claimed by
 * atomically moving it from "scheduled" to "sending", so overlapping runs or
 * retries can't send it twice.
 */
export async function sendDueMessages(now = new Date()) {
  const counts = { sent: 0, failed: 0, skipped: 0, cancelled: 0, interrupted: 0 };

  // A row stuck in "sending" may or may not have reached Twilio: never resend it automatically.
  const stuck = await db
    .update(smsSends)
    .set({ status: "failed", reason: "interrupted" })
    .where(and(eq(smsSends.status, "sending"), lt(smsSends.claimedAt, new Date(now.getTime() - STUCK_MS))))
    .returning({ id: smsSends.id });
  counts.interrupted = stuck.length;

  const settings = await getSettings();
  if (!settings.smsProgramEnabled) return { ...counts, paused: true };

  const due = await db
    .select({ id: smsSends.id })
    .from(smsSends)
    .where(and(eq(smsSends.status, "scheduled"), lte(smsSends.scheduledFor, now)))
    .orderBy(asc(smsSends.scheduledFor), asc(smsSends.id))
    .limit(BATCH);
  for (const row of due) {
    const [claimed] = await db
      .update(smsSends)
      .set({ status: "sending", claimedAt: new Date(), attempts: sql`${smsSends.attempts} + 1` })
      .where(and(eq(smsSends.id, row.id), eq(smsSends.status, "scheduled")))
      .returning({ id: smsSends.id });
    if (!claimed) continue;
    try {
      counts[await deliver(claimed.id, now)]++;
    } catch (error) {
      logger.error({ sendId: claimed.id, err: (error as Error).message }, "sms delivery crashed");
      await db
        .update(smsSends)
        .set({ status: "failed", reason: "error" })
        .where(and(eq(smsSends.id, claimed.id), eq(smsSends.status, "sending")));
      counts.failed++;
    }
  }
  return { ...counts, paused: false };
}

/** Staff "Send now" for a failed, skipped or cancelled message (never for one already sent). */
export async function resendMessage(sendId: string, actorId: string) {
  const [claimed] = await db
    .update(smsSends)
    .set({ status: "sending", claimedAt: new Date(), handledBy: actorId, attempts: sql`${smsSends.attempts} + 1` })
    .where(and(eq(smsSends.id, sendId), inArray(smsSends.status, ["failed", "skipped", "cancelled", "scheduled"])))
    .returning({ id: smsSends.id });
  if (!claimed) return null;
  return deliver(claimed.id, new Date(), { manual: true });
}

export async function cancelMessage(sendId: string, actorId: string) {
  const rows = await db
    .update(smsSends)
    .set({ status: "cancelled", reason: "staff", handledBy: actorId })
    .where(and(eq(smsSends.id, sendId), eq(smsSends.status, "scheduled")))
    .returning({ id: smsSends.id });
  return rows.length === 1;
}

/**
 * Records a click on a program link and returns where to send the visitor.
 * Counts every click on the message; the engagement row keeps first/last.
 */
export async function recordClick(sendId: string) {
  const now = new Date();
  const [send] = await db
    .update(smsSends)
    .set({ clicks: sql`${smsSends.clicks} + 1`, clickedAt: sql`coalesce(${smsSends.clickedAt}, ${now.toISOString()}::timestamptz)` })
    .where(eq(smsSends.id, sendId))
    .returning({
      id: smsSends.id,
      userId: smsSends.userId,
      flag: smsSends.flag,
      week: smsSends.week,
      cycle: smsSends.cycle,
      linkPath: smsSends.linkPath,
    });
  if (!send) return null;
  try {
    await db
      .insert(smsClicks)
      .values({ userId: send.userId, sendId: send.id, flag: send.flag, week: send.week, cycle: send.cycle, firstClickAt: now, lastClickAt: now })
      .onConflictDoUpdate({
        target: [smsClicks.userId, smsClicks.flag, smsClicks.cycle],
        set: { lastClickAt: now, count: sql`${smsClicks.count} + 1` },
      });
  } catch (error) {
    logger.warn({ sendId, err: (error as Error).message }, "sms click row failed");
  }
  await trackUsage(send.userId, "sms_click", { week: send.week, flag: send.flag });
  return { userId: send.userId, path: safeInternalPath(send.linkPath, "/") };
}

