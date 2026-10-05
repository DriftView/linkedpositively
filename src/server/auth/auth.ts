import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { env } from "@/env";
import { db } from "@/server/db/client";
import { accounts, rateLimits, sessions, users, verifications } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { sendMail } from "@/server/services/mail";
import { ResetPasswordEmail } from "@/server/emails/reset-password";
import { isDrupalHash, verifyDrupalPassword } from "./drupal-password";
import { onSignIn, onSignOut } from "./login-events";

const SESSION_DAYS = 14;

const DISABLED_AUTH_PATHS = [
  "/update-user",
  "/update-session",
  "/change-email",
  "/delete-user",
  "/is-username-available",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/remove-user",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/impersonate-user",
  "/admin/list-users",
  "/admin/get-user",
  "/admin/list-user-sessions",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/has-permission",
];

export const auth = betterAuth({
  appName: "Link Positively",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
  }),

  // HTTP endpoints the app doesn't use. Profile and account edits go through
  // our Server Actions (which validate, check ownership and audit); left open,
  // /update-user would let anyone rename their login username or set any
  // image URL, and /is-username-available would reveal who is in the study.
  // Staff tools call the admin endpoints server-side (auth.api) after our own
  // permission checks and audit logging, so only "stop impersonating" stays.
  disabledPaths: DISABLED_AUTH_PATHS,

  emailAndPassword: {
    enabled: true,
    // Accounts are created by staff (Drupal: admin-only registration).
    disableSignUp: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60 * 24,
    password: {
      hash: (password) => hashPassword(password),
      // Migrated accounts keep their Drupal hash until their first sign-in,
      // when the hook below replaces it with a modern one.
      verify: async ({ hash, password }) =>
        isDrupalHash(hash) ? verifyDrupalPassword(password, hash) : verifyPassword({ hash, password }),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your Link Positively password",
        template: ResetPasswordEmail({ url, name: user.name }),
        ref: `reset:${user.id}`,
      });
    },
  },

  user: {
    additionalFields: {
      timezone: { type: "string", required: false, input: false, defaultValue: "America/New_York" },
      programs: { type: "string[]", required: false, input: false, defaultValue: ["lp"] },
      legacy: { type: "json", required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * SESSION_DAYS,
    updateAge: 60 * 60 * 24,
    // Roles and bans are re-read at least every minute.
    cookieCache: { enabled: true, maxAge: 60 },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 8 },
      "/request-password-reset": { window: 60 * 15, max: 5 },
    },
  },

  advanced: {
    cookiePrefix: "lp",
    useSecureCookies: env.NODE_ENV === "production",
    // Ids are Postgres uuids (crypto.randomUUID), like every other table.
    database: { generateId: "uuid" },
  },

  plugins: [
    username({
      minUsernameLength: 2,
      maxUsernameLength: 60,
      // Drupal usernames may contain spaces, dots, @, apostrophes and hyphens.
      usernameValidator: (value) => /^[\p{L}\p{N} ._@'-]+$/u.test(value),
    }),
    admin({
      defaultRole: "control",
      adminRoles: ["admin"],
      impersonationSessionDuration: 60 * 60,
      bannedUserMessage:
        "This account has been deactivated. Please contact the study team if you think this is a mistake.",
    }),
    nextCookies(),
  ],

  hooks: {
    // Bookkeeping runs after the response is sent (next/server `after`), so
    // its database round trips don't hold up signing in or out.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-in/")) {
        const session = ctx.context.newSession;
        if (!session) return;
        const userId = session.user.id;
        const password = (ctx.body as { password?: string } | undefined)?.password;
        const userAgent = ctx.headers?.get("user-agent") ?? "";
        after(async () => {
          await upgradeLegacyPassword(userId, password);
          await onSignIn(userId, userAgent);
        });
      }
      if (ctx.path === "/sign-out") {
        const userId = ctx.context.session?.user.id;
        if (userId) after(() => onSignOut(userId));
      }
    }),
  },
});

/** Replaces a Drupal password hash with a modern one after a successful sign-in. */
async function upgradeLegacyPassword(userId: string, password: string | undefined) {
  if (!password) return;
  try {
    const where = and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"));
    const [account] = await db.select({ password: accounts.password }).from(accounts).where(where).limit(1);
    if (!account?.password || !isDrupalHash(account.password)) return;
    await db
      .update(accounts)
      .set({ password: await hashPassword(password), updatedAt: new Date() })
      .where(where);
    logger.info({ userId }, "upgraded legacy password hash");
  } catch (error) {
    logger.error({ userId, err: error instanceof Error ? error.message : error }, "password upgrade failed");
  }
}

export type AuthSession = typeof auth.$Infer.Session;
