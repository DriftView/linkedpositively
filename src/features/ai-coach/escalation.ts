import "server-only";
import { and, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { after } from "next/server";
import { env } from "@/env";
import { getSettings } from "@/features/admin/settings";
import { notify } from "@/features/notifications/notify";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import {
  aiSafetyAlerts,
  profiles,
  users,
  type AiAlertCategory,
  type AiAlertLevel,
  type AiAlertSource,
} from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/server/logger";
import { sendMail } from "@/server/services/mail";
import { sendSms } from "@/server/services/sms";
import { trackUsage } from "@/server/services/usage";
import { SafetyAlertEmail } from "./emails/safety-alert";
import { riskRank } from "./safety";

/**
 * Human escalation. A conversation has at most one open alert; a more serious
 * signal raises its level (and notifies again). Who hears about it:
 *  - staff with `ai.review`: in-app notification (every level)
 *  - the member's peer navigator: in-app nudge to check in (elevated, urgent)
 *  - the safety email (or study contact email): a link, no details (every level)
 *  - the on-call phone: a text (urgent only)
 * Delivery runs as an Inngest job (event payload: the alert id only), or right
 * after the response when no job runner is available.
 */

export type RaiseAlertInput = {
  userId: string;
  conversationId: string;
  messageId: string | null;
  level: AiAlertLevel;
  category: AiAlertCategory;
  source: AiAlertSource;
  reason: string;
};

/** Creates or escalates the conversation's alert. Returns the alert id, or null on failure. Never throws. */
export async function raiseAlert(input: RaiseAlertInput): Promise<string | null> {
  try {
    const [existing] = await db
      .select({ id: aiSafetyAlerts.id, level: aiSafetyAlerts.level })
      .from(aiSafetyAlerts)
      .where(and(eq(aiSafetyAlerts.conversationId, input.conversationId), ne(aiSafetyAlerts.status, "resolved")))
      .limit(1);
    let alertId: string;
    if (existing) {
      if (riskRank(input.level) <= riskRank(existing.level)) return existing.id;
      await db
        .update(aiSafetyAlerts)
        .set({
          level: input.level,
          category: input.category,
          source: input.source,
          reason: input.reason.slice(0, 300),
          messageId: input.messageId,
          status: "open",
        })
        .where(eq(aiSafetyAlerts.id, existing.id));
      alertId = existing.id;
    } else {
      const [created] = await db
        .insert(aiSafetyAlerts)
        .values({ ...input, reason: input.reason.slice(0, 300) })
        .returning({ id: aiSafetyAlerts.id });
      alertId = created.id;
    }
    await trackUsage(input.userId, "ai_safety_flag", {
      level: input.level,
      category: input.category,
      source: input.source,
    });
    await queueAlertDelivery(alertId, input.level);
    return alertId;
  } catch (error) {
    logger.error({ userId: input.userId, err: error instanceof Error ? error.message : error }, "ai alert failed");
    return null;
  }
}

async function queueAlertDelivery(alertId: string, level: AiAlertLevel) {
  try {
    await inngest.send({ name: "ai/safety.alert", data: { alertId, level } });
  } catch {
    // No job runner (e.g. local development): deliver once the response has been sent.
    after(() => deliverAlert(alertId, level));
  }
}

/** Sends every notification for the alert at `level`. Idempotent for in-app notifications (dedupe keys). */
export async function deliverAlert(alertId: string, level: AiAlertLevel) {
  const [alert] = await db
    .select({ id: aiSafetyAlerts.id, userId: aiSafetyAlerts.userId, status: aiSafetyAlerts.status })
    .from(aiSafetyAlerts)
    .where(eq(aiSafetyAlerts.id, alertId))
    .limit(1);
  if (!alert || alert.status === "resolved") return { skipped: true };

  const settings = await getSettings();
  const href = `/admin/ai/alerts/${alert.id}`;
  const label = level === "urgent" ? "urgent" : level === "elevated" ? "safety" : "support";

  // Staff reviewers (in-app).
  const staff = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(isNotNull(users.role), sql`${users.banned} is not true`));
  const reviewers = staff.filter((user) => hasPermission(parseRoles(user.role), "ai.review"));
  await Promise.all(
    reviewers.map((reviewer) =>
      notify({
        userId: reviewer.id,
        kind: "system",
        text:
          level === "support"
            ? "AI Coach: a member asked to talk to a person."
            : `AI Coach: a conversation needs ${label} review.`,
        dedupeKey: `ai-alert:${alert.id}:${level}`,
        href,
      }),
    ),
  );

  // The member's peer navigator (in-app nudge, no details).
  if (level !== "support") {
    const [profile] = await db
      .select({ coachId: profiles.coachId })
      .from(profiles)
      .where(eq(profiles.userId, alert.userId))
      .limit(1);
    if (profile?.coachId && !reviewers.some((reviewer) => reviewer.id === profile.coachId)) {
      await notify({
        userId: profile.coachId,
        kind: "system",
        text: "A participant you support may need extra help. Please check in with them.",
        dedupeKey: `ai-alert-coach:${alert.id}:${level}`,
        href: `/coach/${alert.userId}`,
      });
    }
  }

  // Email (a link only).
  const to = settings.aiAlertEmail || settings.contactEmail;
  const url = `${env.NEXT_PUBLIC_APP_URL}${href}`;
  if (to) {
    await sendMail({
      to,
      subject:
        level === "urgent"
          ? `URGENT: AI Coach safety alert – ${settings.studyName}`
          : `AI Coach alert – ${settings.studyName}`,
      template: SafetyAlertEmail({ url, level, studyName: settings.studyName }),
      ref: `ai-alert:${alert.id}:${level}`,
    });
  }

  // On-call text (urgent only).
  if (level === "urgent" && settings.aiOnCallPhone) {
    await sendSms({
      to: settings.aiOnCallPhone,
      body: `${settings.studyName}: an urgent AI Coach safety alert needs review now. ${url}`,
      ref: `ai-alert:${alert.id}`,
    });
  }
  return {
    reviewers: reviewers.length,
    emailed: Boolean(to),
    texted: level === "urgent" && Boolean(settings.aiOnCallPhone),
  };
}

/** Open and in-review alerts, for the staff nav badge. */
export async function openAlertCount() {
  const [row] = await db
    .select({ total: count() })
    .from(aiSafetyAlerts)
    .where(inArray(aiSafetyAlerts.status, ["open", "in_review"]));
  return row?.total ?? 0;
}
