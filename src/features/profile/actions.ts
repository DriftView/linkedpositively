"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { authedAction, UserFacingError } from "@/server/actions/safe-action";
import { hasPermission } from "@/server/auth/roles";
import { db, withTransaction } from "@/server/db/client";
import { accounts, profiles, users, type NewProfile } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { deleteFile, putFile } from "@/server/services/storage";
import { trackUsage } from "@/server/services/usage";
import { COLOR_THEME_LEVEL, isAvatarUnlocked, isBadgeUnlocked, avatarPackOf, badgePackOf } from "@/features/gamification/catalog";
import { levelForPoints } from "@/features/gamification/levels";
import { award, totalPoints } from "@/features/gamification/points";
import { normalizePhone } from "./phone";
import {
  aboutMeSchema,
  accountSchema,
  avatarSchema,
  badgesSchema,
  colorThemeSchema,
  peerNavProfileSchema,
  PHOTO_MAX_BYTES,
} from "./schemas";

type ProfileFields = Omit<Partial<NewProfile>, "id" | "userId" | "createdAt" | "updatedAt">;

/** Creates or updates the user's profile row with `set`. */
async function upsertProfile(userId: string, set: ProfileFields) {
  await db.insert(profiles).values({ ...set, userId }).onConflictDoUpdate({ target: profiles.userId, set });
}

/** Sets the profile photo/avatar fields and returns the photo key it replaced (one transaction). */
async function swapPhoto(userId: string, set: ProfileFields, options: { create: boolean }) {
  return withTransaction(async (tx) => {
    const [previous] = await tx
      .select({ photoKey: profiles.photoKey })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for("update");
    if (previous) await tx.update(profiles).set(set).where(eq(profiles.userId, userId));
    else if (options.create) await tx.insert(profiles).values({ ...set, userId }).onConflictDoUpdate({ target: profiles.userId, set });
    return previous?.photoKey ?? null;
  });
}

async function currentLevel(userId: string) {
  return levelForPoints(await totalPoints(userId)).level;
}

/** Profile paths that show avatars/badges; refreshed after edits. */
function revalidateProfile(username: string) {
  revalidatePath("/profile");
  if (username) revalidatePath(`/people/${username}`);
}

/**
 * One-time 50 points once the profile has a picture, an "About me" and at
 * least one badge (legacy P15, which the old code could never reach).
 */
async function maybeAwardProfileComplete(userId: string) {
  const [profile] = await db
    .select({ aboutMe: profiles.aboutMe, avatarId: profiles.avatarId, photoKey: profiles.photoKey, badges: profiles.badges })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!profile) return false;
  const complete = Boolean((profile.avatarId || profile.photoKey) && profile.aboutMe?.trim() && profile.badges?.length);
  if (!complete) return false;
  const result = await award({ userId, reason: "profile_complete", key: "profile-complete" });
  return result.awarded;
}

export const saveAboutMe = authedAction.inputSchema(aboutMeSchema).action(async ({ parsedInput, ctx }) => {
  const aboutMe = parsedInput.aboutMe.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  await upsertProfile(ctx.viewer.id, { aboutMe });
  await trackUsage(ctx.viewer.id, "profile_edit", { field: "aboutMe" });
  const completed = await maybeAwardProfileComplete(ctx.viewer.id);
  revalidateProfile(ctx.viewer.username);
  return { aboutMe, completed };
});

export const chooseAvatar = authedAction.inputSchema(avatarSchema).action(async ({ parsedInput, ctx }) => {
  const pack = avatarPackOf(parsedInput.avatarId);
  if (!pack) throw new UserFacingError("That avatar isn't available.");
  if (!isAvatarUnlocked(parsedInput.avatarId, await currentLevel(ctx.viewer.id))) {
    throw new UserFacingError(`That avatar unlocks at Level ${pack.level}. Keep going!`);
  }
  // A library avatar replaces an uploaded photo (legacy behaviour); the photo file is removed.
  const previousKey = await swapPhoto(ctx.viewer.id, { avatarId: parsedInput.avatarId, photoKey: null }, { create: true });
  if (previousKey) await deleteFile(previousKey).catch(() => undefined);
  await trackUsage(ctx.viewer.id, "profile_avatar", { avatar: parsedInput.avatarId });
  const completed = await maybeAwardProfileComplete(ctx.viewer.id);
  revalidateProfile(ctx.viewer.username);
  return { avatarId: parsedInput.avatarId, version: new Date().toISOString(), completed };
});

export const chooseBadges = authedAction.inputSchema(badgesSchema).action(async ({ parsedInput, ctx }) => {
  const level = await currentLevel(ctx.viewer.id);
  const badges = [...new Set(parsedInput.badges)];
  for (const id of badges) {
    const pack = badgePackOf(id);
    if (!pack) throw new UserFacingError("One of those badges isn't available.");
    if (!isBadgeUnlocked(id, level)) throw new UserFacingError(`Badge pack ${pack.pack} unlocks at Level ${pack.level}.`);
  }
  await upsertProfile(ctx.viewer.id, { badges });
  await trackUsage(ctx.viewer.id, "profile_edit", { field: "badges", count: badges.length });
  const completed = await maybeAwardProfileComplete(ctx.viewer.id);
  revalidateProfile(ctx.viewer.username);
  return { badges, completed };
});

export const chooseColorTheme = authedAction.inputSchema(colorThemeSchema).action(async ({ parsedInput, ctx }) => {
  if (parsedInput.theme !== "theme-1" && (await currentLevel(ctx.viewer.id)) < COLOR_THEME_LEVEL) {
    throw new UserFacingError(`Colour themes unlock at Level ${COLOR_THEME_LEVEL}.`);
  }
  await upsertProfile(ctx.viewer.id, { colorTheme: parsedInput.theme });
  await trackUsage(ctx.viewer.id, "profile_edit", { field: "colorTheme" });
  revalidatePath("/", "layout");
  return { theme: parsedInput.theme };
});

/** Checks the file's first bytes: the browser-reported type is not trusted. */
function sniffImage(bytes: Buffer): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/**
 * Uploads a profile photo (usually the square crop made in the browser).
 * Stored privately; shown through /api/avatars/[userId] with a signed URL.
 */
export const uploadPhoto = authedAction.inputSchema(z.instanceof(FormData)).action(async ({ parsedInput, ctx }) => {
  const file = parsedInput.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new UserFacingError("Choose a photo to upload.");
  if (file.size > PHOTO_MAX_BYTES) throw new UserFacingError("That photo is too large. Please use one under 5 MB.");
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(data);
  if (!type) throw new UserFacingError("That file isn't a photo we can use. Try a JPG, PNG, GIF or WebP.");

  const key = await putFile(`profile-photos/${ctx.viewer.id}`, data, type);
  const previousKey = await swapPhoto(ctx.viewer.id, { photoKey: key }, { create: true });
  if (previousKey && previousKey !== key) await deleteFile(previousKey).catch(() => undefined);
  await trackUsage(ctx.viewer.id, "profile_avatar", { photo: true });
  const completed = await maybeAwardProfileComplete(ctx.viewer.id);
  revalidateProfile(ctx.viewer.username);
  return { version: new Date().toISOString(), completed };
});

export const removePhoto = authedAction.action(async ({ ctx }) => {
  const previousKey = await swapPhoto(ctx.viewer.id, { photoKey: null }, { create: false });
  if (previousKey) await deleteFile(previousKey).catch(() => undefined);
  revalidateProfile(ctx.viewer.username);
  return { version: new Date().toISOString() };
});

// ---------------------------------------------------------------------------
// Account settings

async function verifyCurrentPassword(userId: string, password: string) {
  const [account] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!account?.password) return false;
  const ctx = await auth.$context;
  try {
    return await ctx.password.verify({ hash: account.password, password });
  } catch {
    return false;
  }
}

export const updateAccount = authedAction.inputSchema(accountSchema).action(async ({ parsedInput, ctx }) => {
  const viewer = ctx.viewer;
  const email = parsedInput.email.toLowerCase();

  if (!isValidTimezone(parsedInput.timezone)) throw new UserFacingError("Choose a timezone from the list.");

  let phone: string | null | undefined;
  if (parsedInput.phone !== undefined) {
    phone = parsedInput.phone ? normalizePhone(parsedInput.phone) : null;
    if (parsedInput.phone && !phone) {
      throw new UserFacingError("Enter a mobile number like (555) 123-4567, or +44… for numbers outside the US.");
    }
  }

  const emailChanged = email !== viewer.email.toLowerCase();
  if (emailChanged) {
    if (!parsedInput.currentPassword) throw new UserFacingError("Enter your current password to change your email.");
    if (!(await verifyCurrentPassword(viewer.id, parsedInput.currentPassword))) {
      throw new UserFacingError("That password isn't right. Your email wasn't changed.");
    }
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, viewer.id)))
      .limit(1);
    if (taken) throw new UserFacingError("That email is already used by another account.");
  }

  await db
    .update(users)
    .set({
      name: parsedInput.name,
      timezone: parsedInput.timezone,
      ...(emailChanged ? { email, emailVerified: false } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, viewer.id));
  if (phone !== undefined) {
    if (hasPermission(viewer.roles, "lp.access") && !viewer.staff) {
      await upsertProfile(viewer.id, { phone: phone || null });
    }
  }
  if (emailChanged) logger.info({ userId: viewer.id }, "account email changed");

  // Refresh the cached session so the header and timezone update right away.
  await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } }).catch(() => null);
  revalidatePath("/", "layout");
  return { emailChanged, phone: phone ?? null };
});

export const updatePeerNavProfile = authedAction.inputSchema(peerNavProfileSchema).action(async ({ parsedInput, ctx }) => {
  const isCoach = hasPermission(ctx.viewer.roles, "peernav.coach");
  if (!isCoach && !hasPermission(ctx.viewer.roles, "peernav.participant")) throw new UserFacingError("You don't have a Peer Navigation profile.");
  const set: ProfileFields = {
    firstName: parsedInput.firstName,
    pronouns: parsedInput.pronouns,
    location: parsedInput.location,
    aboutMe: parsedInput.aboutMe,
  };
  // Only peer navigators host sessions, so only they set a meeting link.
  if (isCoach) set.zoomLink = parsedInput.zoomLink;
  await upsertProfile(ctx.viewer.id, set);
  await trackUsage(ctx.viewer.id, "profile_edit", { field: "peerNav" });
  revalidatePath("/settings");
  return { saved: true };
});

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
