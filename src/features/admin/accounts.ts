import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { createElement } from "react";
import { cancelSchedule, ensureSchedule } from "@/features/sms/service";
import { startOfLocalDay, welcomeSendTime } from "@/features/sms/schedule";
import { appUrl } from "@/features/sms/links";
import { auth } from "@/server/auth/auth";
import { DELEGABLE_ROLES, parseRoles, ROLE_LABELS, serializeRoles, type Role } from "@/server/auth/roles";
import type { Viewer } from "@/server/auth/session";
import { db, withTransaction } from "@/server/db/client";
import { accounts, pnCoachAssignments, profiles, smsSends, users } from "@/server/db/schema";
import { AccountReadyEmail } from "@/server/emails/account-ready";
import { ResetPasswordEmail } from "@/server/emails/reset-password";
import { WelcomeEmail } from "@/server/emails/welcome";
import { logger } from "@/server/logger";
import { sendMail } from "@/server/services/mail";
import { audit } from "./audit";
import { getSettings } from "./settings";

/**
 * Account and study-arm operations shared by the staff screens and jobs.
 * Better Auth's admin endpoints only accept the "admin" role, so staff with
 * delegated rights (research admins, coordinators) go through Better Auth's
 * internal adapter after our own permission checks.
 */

export const WELCOME_LINK_DAYS = 7;
const RESET_LINK_HOURS = 24;

type Actor = Pick<Viewer, "id" | "roles" | "impersonatedBy">;

/** Programs a set of roles gives access to. */
export function programsFor(roles: Role[]): ("lp" | "peernav")[] {
  const programs = new Set<"lp" | "peernav">();
  if (roles.some((role) => ["admin", "research_admin", "coordinator", "participant", "control"].includes(role)))
    programs.add("lp");
  if (roles.some((role) => ["admin", "coordinator", "coach", "ecoach_user"].includes(role))) programs.add("peernav");
  if (!programs.size) programs.add("lp");
  return [...programs];
}

/** Roles `actor` may add or remove (union over their roles; Drupal role_delegation). */
export function delegableRoles(actorRoles: Role[]): Set<Role> {
  const set = new Set<Role>();
  for (const role of actorRoles) for (const delegable of DELEGABLE_ROLES[role]) set.add(delegable);
  return set;
}

async function updateAuthUser(userId: string, data: Record<string, unknown>) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(userId, { ...data, updatedAt: new Date() });
}

/** Whether the person has ever chosen a password (accounts made by staff or the survey sync have none). */
export async function hasPassword(userId: string) {
  const [account] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  return Boolean(account?.password);
}

/** A one-time link to /reset-password (optionally in "welcome" mode). */
export async function createPasswordLink(userId: string, options: { welcome: boolean }) {
  const ctx = await auth.$context;
  const token = crypto.randomUUID().replace(/-/g, "");
  const seconds = options.welcome ? WELCOME_LINK_DAYS * 86_400 : RESET_LINK_HOURS * 3600;
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + seconds * 1000),
  });
  const callback = appUrl(options.welcome ? "/reset-password?welcome=1" : "/reset-password");
  return `${ctx.baseURL}/reset-password/${token}?callbackURL=${encodeURIComponent(callback)}`;
}

type MailUser = { id: string; email?: string | null; name?: string | null; username?: string | null };

export async function sendWelcomeEmail(user: MailUser) {
  if (!user.email) return false;
  const settings = await getSettings();
  const url = await createPasswordLink(user.id, { welcome: true });
  const result = await sendMail({
    to: user.email,
    subject: `Welcome to ${settings.studyName}`,
    template: createElement(WelcomeEmail, {
      url,
      name: user.name || user.username || "there",
      username: user.username ?? "",
      studyName: settings.studyName,
      contactEmail: settings.contactEmail || undefined,
      expiresInDays: WELCOME_LINK_DAYS,
    }),
    ref: `welcome:${user.id}`,
  });
  return result.ok;
}

export async function sendResetEmail(user: MailUser) {
  if (!user.email) return false;
  const url = await createPasswordLink(user.id, { welcome: false });
  const settings = await getSettings();
  const result = await sendMail({
    to: user.email,
    subject: `Reset your ${settings.studyName} password`,
    template: createElement(ResetPasswordEmail, { url, name: user.name || user.username || "there" }),
    ref: `reset:${user.id}`,
  });
  return result.ok;
}

async function sendAccountReadyEmail(user: MailUser) {
  if (!user.email) return;
  const settings = await getSettings();
  const needsPassword = !(await hasPassword(user.id));
  const url = needsPassword ? await createPasswordLink(user.id, { welcome: true }) : appUrl("/login");
  await sendMail({
    to: user.email,
    subject: `Your ${settings.studyName} account is ready`,
    template: createElement(AccountReadyEmail, {
      url,
      name: user.name || user.username || "there",
      studyName: settings.studyName,
      needsPassword,
      contactEmail: settings.contactEmail || undefined,
    }),
    ref: `account-ready:${user.id}`,
  });
}

type ArmChange = { userId: string; from: Role[]; to: Role[] };

/**
 * Applies a new role set and runs the study side effects of an arm change:
 * joining `participant` starts the intervention (start date = today in the
 * participant's timezone, WELCOME text 15 minutes later, weekly schedule,
 * account email); leaving it cancels pending texts.
 */
async function applyRoles(change: ArmChange, options: { sendAccountEmail: boolean }) {
  const roles: Role[] = change.to.length ? change.to : ["control"];
  await updateAuthUser(change.userId, { role: serializeRoles(roles), programs: programsFor(roles) });

  const wasParticipant = change.from.includes("participant");
  const isParticipant = roles.includes("participant");
  if (!wasParticipant && isParticipant) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: users.username,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, change.userId))
      .limit(1);
    const now = new Date();
    const timezone = user?.timezone || "America/New_York";
    const dates = { interventionStartDate: startOfLocalDay(now, timezone), roleChangedAt: welcomeSendTime(now) };
    await db
      .insert(profiles)
      .values({ userId: change.userId, ...dates })
      .onConflictDoUpdate({ target: profiles.userId, set: dates });
    await ensureSchedule(change.userId);
    if (options.sendAccountEmail && user) {
      try {
        await sendAccountReadyEmail(user);
      } catch (error) {
        logger.error({ userId: change.userId, err: (error as Error).message }, "account email failed");
      }
    }
  }
  if (wasParticipant && !isParticipant) await cancelSchedule([change.userId], "left_intervention");
}

async function loadRoles(userIds: string[]) {
  if (!userIds.length) return new Map<string, Role[]>();
  const rows = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, userIds));
  return new Map(rows.map((user) => [user.id, parseRoles(user.role)]));
}

/** Legacy "Convert User(s) to Participant Role": control → participant (other roles kept). */
export async function convertToParticipant(
  actor: Actor,
  userIds: string[],
  options: { sendAccountEmail?: boolean } = {},
) {
  const settings = await getSettings();
  const sendAccountEmail = options.sendAccountEmail ?? settings.accountEmailOnRandomize;
  const current = await loadRoles(userIds);
  const converted: string[] = [];
  for (const [userId, roles] of current) {
    if (roles.includes("participant")) continue;
    if (roles.some((role) => ["admin", "research_admin", "coordinator", "coach"].includes(role))) continue;
    const next = [...roles.filter((role) => role !== "control"), "participant" as Role];
    await applyRoles({ userId, from: roles, to: next }, { sendAccountEmail });
    converted.push(userId);
  }
  if (converted.length) {
    await audit({
      actor,
      action: "randomize.participant",
      targetIds: converted,
      summary: `Converted ${converted.length} control ${converted.length === 1 ? "account" : "accounts"} to participant`,
    });
  }
  return converted.length;
}

/** Legacy "Convert User BACK to Control Role" (which crashed on a missing table). */
export async function convertToControl(actor: Actor, userIds: string[]) {
  const current = await loadRoles(userIds);
  const converted: string[] = [];
  for (const [userId, roles] of current) {
    if (!roles.includes("participant")) continue;
    const next = [...roles.filter((role) => role !== "participant"), "control" as Role];
    await applyRoles({ userId, from: roles, to: next }, { sendAccountEmail: false });
    converted.push(userId);
  }
  if (converted.length) {
    await audit({
      actor,
      action: "randomize.control",
      targetIds: converted,
      summary: `Moved ${converted.length} ${converted.length === 1 ? "participant" : "participants"} back to control`,
    });
  }
  return converted.length;
}

/**
 * Legacy "Add Study Roles" / "Change Role": sets the study roles
 * (participant, ecoach_user) and keeps every other role. Removing
 * participant puts the person back in control.
 */
export async function setStudyRoles(actor: Actor, userIds: string[], study: { participant: boolean; ecoach: boolean }) {
  const settings = await getSettings();
  const current = await loadRoles(userIds);
  const changed: string[] = [];
  for (const [userId, roles] of current) {
    const kept = roles.filter((role) => !["participant", "ecoach_user", "control"].includes(role));
    const next: Role[] = [...kept];
    if (study.participant) next.push("participant");
    else if (roles.includes("control") || roles.includes("participant") || !kept.length) next.push("control");
    if (study.ecoach) next.push("ecoach_user");
    if (serializeRoles([...next].sort()) === serializeRoles([...roles].sort())) continue;
    await applyRoles({ userId, from: roles, to: next }, { sendAccountEmail: settings.accountEmailOnRandomize });
    changed.push(userId);
  }
  if (changed.length) {
    const labels = [study.participant ? "participant" : "control", study.ecoach ? "Peer Navigation" : null].filter(
      Boolean,
    );
    await audit({
      actor,
      action: "user.roles",
      targetIds: changed,
      summary: `Set study roles to ${labels.join(" + ")} for ${changed.length} ${changed.length === 1 ? "person" : "people"}`,
    });
  }
  return changed.length;
}

export class RoleChangeError extends Error {}

/**
 * Role editor on a user's page. Only roles the actor may delegate can be
 * added or removed; others are kept as they are.
 */
export async function setUserRoles(actor: Actor, userId: string, requested: Role[]) {
  if (userId === actor.id) throw new RoleChangeError("You can't change your own roles. Ask another administrator.");
  const current = (await loadRoles([userId])).get(userId);
  if (!current) throw new RoleChangeError("That account no longer exists.");
  const allowed = delegableRoles(actor.roles);
  const requestedSet = new Set(requested);
  const next = new Set<Role>(current.filter((role) => !allowed.has(role)));
  for (const role of requestedSet) if (allowed.has(role)) next.add(role);
  if (next.has("participant")) next.delete("control");
  const nextRoles = [...next];
  if (!nextRoles.length) nextRoles.push("control");
  const settings = await getSettings();
  await applyRoles({ userId, from: current, to: nextRoles }, { sendAccountEmail: settings.accountEmailOnRandomize });
  await audit({
    actor,
    action: "user.roles",
    targetIds: [userId],
    summary: `Roles changed from ${current.map((role) => ROLE_LABELS[role]).join(", ") || "none"} to ${nextRoles.map((role) => ROLE_LABELS[role]).join(", ")}`,
    meta: { from: current, to: nextRoles },
  });
  return nextRoles;
}

/** Legacy "Deactivate Participant(s)" (user_cancel_block) and auto-block. */
export async function blockUsers(actor: Actor | null, userIds: string[], reason: string) {
  const ctx = await auth.$context;
  const blocked: string[] = [];
  for (const userId of userIds) {
    if (actor && userId === actor.id) continue;
    await ctx.internalAdapter.updateUser(userId, {
      banned: true,
      banReason: reason,
      banExpires: null,
      updatedAt: new Date(),
    });
    await ctx.internalAdapter.deleteUserSessions(userId);
    blocked.push(userId);
  }
  if (blocked.length) await cancelSchedule(blocked, "blocked");
  if (blocked.length) {
    await audit({
      actor,
      action: actor ? "user.block" : "user.autoblock",
      targetIds: blocked,
      summary: actor
        ? `Deactivated ${blocked.length} ${blocked.length === 1 ? "account" : "accounts"}`
        : `Automatically deactivated ${blocked.length} ${blocked.length === 1 ? "participant" : "participants"} at the end of the study period`,
      meta: { reason },
    });
  }
  return blocked.length;
}

export async function unblockUsers(actor: Actor, userIds: string[]) {
  for (const userId of userIds) {
    await updateAuthUser(userId, { banned: false, banReason: null, banExpires: null });
  }
  // Texts cancelled by the block that are still ahead go back on the schedule.
  if (userIds.length) {
    await db
      .update(smsSends)
      .set({ status: "scheduled", reason: null })
      .where(
        and(
          inArray(smsSends.userId, userIds),
          eq(smsSends.status, "cancelled"),
          eq(smsSends.reason, "blocked"),
          gt(smsSends.scheduledFor, new Date()),
        ),
      );
  }
  await audit({
    actor,
    action: "user.unblock",
    targetIds: userIds,
    summary: `Reactivated ${userIds.length} ${userIds.length === 1 ? "account" : "accounts"}`,
  });
  return userIds.length;
}

/** Legacy "Assign Coach" (field_coach), with the assignment history kept by Peer Navigation. */
export async function assignCoach(actor: Actor, userIds: string[], coachId: string | null) {
  let changed = 0;
  for (const userId of userIds) {
    const assigned = await withTransaction(async (tx) => {
      const [previous] = await tx
        .select({ coachId: profiles.coachId })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .for("update");
      await tx
        .insert(profiles)
        .values({ userId, coachId })
        .onConflictDoUpdate({ target: profiles.userId, set: { coachId } });
      const previousCoach = previous?.coachId ?? null;
      if (previousCoach === coachId) return false;
      await tx.insert(pnCoachAssignments).values({
        participantId: userId,
        coachId,
        previousCoachId: previousCoach,
        assignedBy: actor.id,
      });
      return true;
    });
    if (assigned) changed++;
  }
  if (changed) {
    await audit({
      actor,
      action: "user.coach",
      targetIds: userIds,
      summary: coachId
        ? `Assigned a peer navigator to ${changed} ${changed === 1 ? "person" : "people"}`
        : `Removed the peer navigator from ${changed} ${changed === 1 ? "person" : "people"}`,
      meta: { coachId },
    });
  }
  return changed;
}

export { updateAuthUser };
