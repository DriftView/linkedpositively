"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizePhone } from "@/features/sms/phone";
import { ensureSchedule } from "@/features/sms/service";
import { authedAction, permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { createAccount } from "@/server/auth/accounts";
import { auth } from "@/server/auth/auth";
import { parseRoles, type Role } from "@/server/auth/roles";
import { db, withTransaction } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";
import { logger } from "@/server/logger";
import {
  assignCoach,
  blockUsers,
  convertToControl,
  convertToParticipant,
  programsFor,
  RoleChangeError,
  sendResetEmail,
  sendWelcomeEmail,
  setStudyRoles,
  setUserRoles,
  unblockUsers,
  updateAuthUser,
} from "./accounts";
import { audit } from "./audit";
import { hasRole } from "./role-sql";
import {
  assignCoachSchema,
  blockSchema,
  createParticipantSchema,
  idsSchema,
  setRolesSchema,
  studyRolesSchema,
  updateAccountSchema,
  userIdSchema,
} from "./schemas";
import { saveSettings } from "./settings";
import { trackUsage } from "@/server/services/usage";
import { settingsSchema } from "./settings-schema";

function revalidateUsers(userIds: string[] = []) {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/randomization");
  for (const id of userIds) revalidatePath(`/admin/users/${id}`);
}

/** Case-insensitive exact email match (the old code used an anchored, escaped /^…$/i regex). */
const emailIs = (email: string) => sql`lower(${users.email}) = ${email.toLowerCase()}`;

async function exists(query: Promise<unknown[]>) {
  return (await query).length > 0;
}

async function findUser(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      role: users.role,
      banned: users.banned,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

/**
 * Only administrators may change administrator accounts. Otherwise a
 * coordinator could, for example, point an admin's email at themselves and
 * send the password link there.
 */
async function assertCanManage(viewer: { roles: Role[] }, userIds: string[]) {
  if (viewer.roles.includes("admin")) return;
  const admins = await exists(
    db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), hasRole(users.role, "admin")))
      .limit(1),
  );
  if (admins) throw new UserFacingError("Only an administrator can change an administrator's account.");
}

/** "Create a New Participant" (legacy admin/add-participant). */
export const createParticipantAction = permissionAction("users.create")
  .inputSchema(createParticipantSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    const phone = normalizePhone(input.phone);
    if (!phone) throw new UserFacingError("Enter a valid phone number with country code. Eg. +19879543210");

    const [nameTaken, emailTaken, studyIdTaken] = await Promise.all([
      exists(db.select({ id: users.id }).from(users).where(eq(users.username, username.toLowerCase())).limit(1)),
      exists(db.select({ id: users.id }).from(users).where(emailIs(email)).limit(1)),
      exists(db.select({ id: profiles.id }).from(profiles).where(eq(profiles.studyId, input.studyId.trim())).limit(1)),
    ]);
    if (studyIdTaken) throw new UserFacingError("This study ID already exists, please check your data.");
    if (nameTaken) throw new UserFacingError("This username already exists, please check your data.");
    if (emailTaken) throw new UserFacingError("This email already exists, please check your data.");
    if (input.ecoach && input.coachId) {
      const coach = await findUser(input.coachId);
      if (!coach || !parseRoles(coach.role).includes("coach"))
        throw new UserFacingError("Choose a peer navigator from the list.");
    }

    // Every new account starts in the control arm (legacy twm_utility_user_insert).
    const roles: Role[] = ["control", ...(input.ecoach ? (["ecoach_user"] as Role[]) : [])];
    const user = await createAccount({
      username,
      email,
      name: username,
      roles,
      programs: programsFor(roles),
      timezone: input.timezone,
    });
    const userId = String(user.id);
    const studyFields = {
      studyId: input.studyId.trim(),
      phone,
      ...(input.pronouns ? { pronouns: input.pronouns } : {}),
      ...(input.age !== null ? { age: input.age } : {}),
    };
    await db
      .insert(profiles)
      .values({ userId, ...studyFields })
      .onConflictDoUpdate({ target: profiles.userId, set: studyFields });
    if (input.ecoach && input.coachId) await assignCoach(ctx.viewer, [userId], input.coachId);
    await audit({
      actor: ctx.viewer,
      action: "user.create",
      targetIds: [userId],
      summary: `Created account ${username}${input.participant ? " and started the intervention" : " (control)"}`,
    });
    if (input.participant) await convertToParticipant(ctx.viewer, [userId], { sendAccountEmail: false });

    let emailed = false;
    if (input.sendWelcome) {
      try {
        emailed = await sendWelcomeEmail({ id: userId, email, name: username, username });
      } catch (error) {
        logger.error({ userId, err: (error as Error).message }, "welcome email failed");
      }
    }
    revalidateUsers();
    return { userId, emailed };
  });

/** Account and study details on a user's page. */
export const updateAccountAction = permissionAction("users.edit")
  .inputSchema(updateAccountSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const user = await findUser(input.userId);
    if (!user) throw new UserFacingError("That account no longer exists.");
    await assertCanManage(ctx.viewer, [input.userId]);
    const email = input.email.toLowerCase();
    if (email !== user.email) {
      const taken = await exists(
        db
          .select({ id: users.id })
          .from(users)
          .where(and(ne(users.id, user.id), emailIs(email)))
          .limit(1),
      );
      if (taken) throw new UserFacingError("This email already exists, please check your data.");
    }
    if (input.studyId) {
      const taken = await exists(
        db
          .select({ id: profiles.id })
          .from(profiles)
          .where(and(ne(profiles.userId, user.id), eq(profiles.studyId, input.studyId)))
          .limit(1),
      );
      if (taken) throw new UserFacingError("This study ID already exists, please check your data.");
    }
    const phone = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !phone)
      throw new UserFacingError("Enter a valid phone number with country code. Eg. +19879543210");

    await updateAuthUser(input.userId, { name: input.name, email, timezone: input.timezone });
    // As with Mongoose's $set (which dropped `undefined`), empty fields keep their stored value.
    const profileFields = {
      ...(input.studyId ? { studyId: input.studyId } : {}),
      ...(phone ? { phone } : {}),
      ...(input.pronouns ? { pronouns: input.pronouns } : {}),
      ...(input.age != null ? { age: input.age } : {}),
      smsOptOut: input.smsOptOut,
    };
    const before = await withTransaction(async (tx) => {
      const [previous] = await tx
        .select({ smsOptOut: profiles.smsOptOut, age: profiles.age })
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .for("update");
      await tx
        .insert(profiles)
        .values({ userId: user.id, ...profileFields })
        .onConflictDoUpdate({ target: profiles.userId, set: profileFields });
      return previous ?? null;
    });
    // The engagement report counts age changes as profile updates (legacy behaviour).
    if (input.age != null && before?.age !== input.age)
      await trackUsage(input.userId, "profile_edit", { field: "age" });
    await audit({
      actor: ctx.viewer,
      action: "user.update",
      targetIds: [input.userId],
      summary: "Updated account details",
    });
    if (Boolean(before?.smsOptOut) !== input.smsOptOut) {
      await audit({
        actor: ctx.viewer,
        action: "sms.optout",
        targetIds: [input.userId],
        summary: input.smsOptOut ? "Turned off study texts" : "Turned study texts back on",
      });
    }
    revalidateUsers([input.userId]);
    return { ok: true };
  });

export const setRolesAction = permissionAction("users.assignRoles")
  .inputSchema(setRolesSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      await assertCanManage(ctx.viewer, [parsedInput.userId]);
      const roles = await setUserRoles(ctx.viewer, parsedInput.userId, parsedInput.roles);
      revalidateUsers([parsedInput.userId]);
      return { roles };
    } catch (error) {
      if (error instanceof RoleChangeError) throw new UserFacingError(error.message);
      throw error;
    }
  });

/** Randomization: control → participant (starts the intervention). */
export const convertToParticipantAction = permissionAction("users.randomize")
  .inputSchema(idsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const count = await convertToParticipant(ctx.viewer, parsedInput.ids);
    revalidateUsers(parsedInput.ids);
    return { count };
  });

export const convertToControlAction = permissionAction("users.randomize")
  .inputSchema(idsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const count = await convertToControl(ctx.viewer, parsedInput.ids);
    revalidateUsers(parsedInput.ids);
    return { count };
  });

/** Legacy "Change Role" / "Add Study Roles". */
export const setStudyRolesAction = permissionAction("users.randomize")
  .inputSchema(studyRolesSchema)
  .action(async ({ parsedInput, ctx }) => {
    await assertCanManage(ctx.viewer, parsedInput.ids);
    const count = await setStudyRoles(ctx.viewer, parsedInput.ids, parsedInput);
    revalidateUsers(parsedInput.ids);
    return { count };
  });

export const blockUsersAction = permissionAction("users.edit")
  .inputSchema(blockSchema)
  .action(async ({ parsedInput, ctx }) => {
    const targets = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, parsedInput.ids));
    // Only administrators may deactivate other administrators.
    const allowed = targets
      .filter((target) => ctx.viewer.roles.includes("admin") || !parseRoles(target.role).includes("admin"))
      .map((target) => target.id);
    const count = await blockUsers(ctx.viewer, allowed, parsedInput.reason || "Deactivated by staff");
    revalidateUsers(parsedInput.ids);
    return { count };
  });

export const unblockUsersAction = permissionAction("users.edit")
  .inputSchema(idsSchema)
  .action(async ({ parsedInput, ctx }) => {
    await assertCanManage(ctx.viewer, parsedInput.ids);
    const count = await unblockUsers(ctx.viewer, parsedInput.ids);
    for (const id of parsedInput.ids) await ensureSchedule(id);
    revalidateUsers(parsedInput.ids);
    return { count };
  });

export const assignCoachAction = permissionAction("peernav.assignCoach")
  .inputSchema(assignCoachSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.coachId) {
      const coach = await findUser(parsedInput.coachId);
      if (!coach || !parseRoles(coach.role).includes("coach"))
        throw new UserFacingError("Choose a peer navigator from the list.");
    }
    const count = await assignCoach(ctx.viewer, parsedInput.ids, parsedInput.coachId);
    revalidateUsers(parsedInput.ids);
    return { count };
  });

export const sendAccountLinkAction = permissionAction("users.edit")
  .inputSchema(userIdSchema.extend({ kind: z.enum(["welcome", "reset"]) }))
  .action(async ({ parsedInput, ctx }) => {
    const user = await findUser(parsedInput.userId);
    if (!user) throw new UserFacingError("That account no longer exists.");
    await assertCanManage(ctx.viewer, [parsedInput.userId]);
    if (user.banned) throw new UserFacingError("Reactivate this account before sending a sign-in link.");
    if (!user.email) throw new UserFacingError("This account has no email address.");
    const ok =
      parsedInput.kind === "welcome"
        ? await sendWelcomeEmail({ id: user.id, email: user.email, name: user.name, username: user.username })
        : await sendResetEmail({ id: user.id, email: user.email, name: user.name, username: user.username });
    if (!ok) throw new UserFacingError("The email couldn't be sent. Please try again in a moment.");
    await audit({
      actor: ctx.viewer,
      action: parsedInput.kind === "welcome" ? "user.welcomeLink" : "user.passwordLink",
      targetIds: [parsedInput.userId],
      summary: parsedInput.kind === "welcome" ? "Sent a welcome (set password) link" : "Sent a password reset link",
    });
    return { ok: true };
  });

/** Admin-only "view as" (legacy Masquerade), through Better Auth impersonation. */
export const impersonateAction = permissionAction("users.impersonate")
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (ctx.viewer.impersonatedBy) throw new UserFacingError("Stop viewing as the current person first.");
    if (parsedInput.userId === ctx.viewer.id) throw new UserFacingError("You're already signed in as yourself.");
    const target = await findUser(parsedInput.userId);
    if (!target) throw new UserFacingError("That account no longer exists.");
    const roles = parseRoles(target.role);
    if (roles.includes("admin")) throw new UserFacingError("Administrators can't be impersonated.");
    if (target.banned) throw new UserFacingError("This account is deactivated. Reactivate it to view the app as them.");
    await auth.api.impersonateUser({ body: { userId: parsedInput.userId }, headers: await headers() });
    await audit({
      actor: ctx.viewer,
      action: "user.impersonate",
      targetIds: [parsedInput.userId],
      summary: "Started viewing the app as this person",
    });
    const destination =
      roles.includes("participant") || roles.includes("control")
        ? "/"
        : roles.includes("ecoach_user")
          ? "/coaching"
          : roles.includes("coach")
            ? "/coach"
            : "/admin";
    return { destination };
  });

export const stopImpersonatingAction = authedAction.action(async ({ ctx }) => {
  const adminId = ctx.viewer.impersonatedBy;
  if (!adminId) return { destination: "/admin" };
  const viewedId = ctx.viewer.id;
  await auth.api.stopImpersonating({ headers: await headers() });
  await audit({
    actor: { id: adminId, impersonatedBy: null },
    action: "user.impersonateStop",
    targetIds: [viewedId],
    summary: "Stopped viewing the app as this person",
  });
  return { destination: `/admin/users/${viewedId}` };
});

export const saveSettingsAction = permissionAction("settings.manage")
  .inputSchema(settingsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const changed = await saveSettings(parsedInput, ctx.viewer.id);
    if (changed.length) {
      await audit({
        actor: ctx.viewer,
        action: "settings.update",
        summary: `Changed ${changed.join(", ")}`,
        meta: { keys: changed },
      });
    }
    revalidatePath("/admin/settings");
    return { changed: changed.length };
  });
