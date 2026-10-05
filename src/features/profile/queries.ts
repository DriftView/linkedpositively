import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { can, type Viewer } from "@/server/auth/session";
import { profiles, users } from "@/server/db/schema";
import { badgeById, effectiveColorTheme, type ColorThemeId } from "@/features/gamification/catalog";
import { levelForPoints } from "@/features/gamification/levels";
import { totalPoints } from "@/features/gamification/points";
import { formatPhone } from "./phone";

export type BadgeDto = { id: string; name: string };

const toBadges = (ids: string[] | null | undefined): BadgeDto[] =>
  (ids ?? []).map((id) => badgeById(id)).filter((badge): badge is BadgeDto => Boolean(badge));

export type OwnProfile = {
  userId: string;
  name: string;
  username: string;
  roleLabel: string;
  aboutMe: string;
  avatarId: string | null;
  hasPhoto: boolean;
  badges: BadgeDto[];
  colorTheme: ColorThemeId;
  /** Theme stored, even if not unlocked yet. */
  colorThemeChoice: ColorThemeId;
  version: string | null;
  canEarn: boolean;
  memberSince: string | null;
};

export const getOwnProfile = cache(async (viewer: Viewer): Promise<OwnProfile> => {
  const [[profile], [user], points] = await Promise.all([
    db
      .select({
        aboutMe: profiles.aboutMe,
        avatarId: profiles.avatarId,
        photoKey: profiles.photoKey,
        badges: profiles.badges,
        colorTheme: profiles.colorTheme,
        updatedAt: profiles.updatedAt,
      })
      .from(profiles)
      .where(eq(profiles.userId, viewer.id))
      .limit(1),
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, viewer.id)).limit(1),
    totalPoints(viewer.id),
  ]);
  const level = levelForPoints(points).level;
  const choice = (profile?.colorTheme ?? "theme-1") as ColorThemeId;
  return {
    userId: viewer.id,
    name: viewer.name,
    username: viewer.username,
    roleLabel: viewer.roleLabel,
    aboutMe: profile?.aboutMe ?? "",
    avatarId: profile?.avatarId ?? null,
    hasPhoto: Boolean(profile?.photoKey),
    badges: toBadges(profile?.badges),
    colorTheme: effectiveColorTheme(choice, level),
    colorThemeChoice: choice,
    version: profile?.updatedAt ? new Date(profile.updatedAt).toISOString() : null,
    canEarn: can(viewer, "gamification.earn"),
    memberSince: user?.createdAt ? new Date(user.createdAt).toISOString() : null,
  };
});

export type PublicProfile = {
  userId: string;
  name: string;
  username: string;
  aboutMe: string;
  badges: BadgeDto[];
  /** Null for people who don't take part in points (e.g. staff). */
  level: number | null;
  roleLabel: string | null;
  version: string | null;
};

/**
 * Another person's public card: name, level, avatar, about me, badges. Only
 * people in the Link Positively community are visible; nothing private
 * (email, phone, study data) is ever read here.
 */
export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const handle = decodeURIComponent(username).trim().toLowerCase();
  if (!handle || handle.length > 60) return null;
  const [user] = await db
    .select({ id: users.id, name: users.name, username: users.username, displayUsername: users.displayUsername, role: users.role })
    .from(users)
    .where(and(eq(users.username, handle), or(isNull(users.banned), ne(users.banned, true))))
    .limit(1);
  if (!user) return null;
  const roles = parseRoles(user.role);
  if (!hasPermission(roles, "community.post")) return null;

  const userId = user.id;
  const [[profile], points] = await Promise.all([
    db
      .select({ aboutMe: profiles.aboutMe, badges: profiles.badges, updatedAt: profiles.updatedAt })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
    totalPoints(userId),
  ]);
  const earns = hasPermission(roles, "gamification.earn") && !roles.includes("admin");
  const staffLabel = roles.includes("coordinator") || roles.includes("research_admin") || roles.includes("admin");
  return {
    userId,
    name: user.name || user.displayUsername || user.username || "Member",
    username: user.username ?? handle,
    aboutMe: profile?.aboutMe ?? "",
    badges: toBadges(profile?.badges),
    level: earns ? levelForPoints(points).level : null,
    roleLabel: staffLabel ? "Study team" : null,
    version: profile?.updatedAt ? new Date(profile.updatedAt).toISOString() : null,
  };
}

export type AccountSettings = {
  name: string;
  username: string;
  email: string;
  timezone: string;
  phone: string;
  phoneDisplay: string;
  roleLabel: string;
  /** Sections the viewer sees. */
  showPhone: boolean;
  showPeerNavProfile: boolean;
  isCoach: boolean;
  peerNav: { firstName: string; pronouns: string; location: string; aboutMe: string; zoomLink: string };
};

export async function getAccountSettings(viewer: Viewer): Promise<AccountSettings> {
  const [profile] = await db
    .select({
      phone: profiles.phone,
      firstName: profiles.firstName,
      pronouns: profiles.pronouns,
      location: profiles.location,
      aboutMe: profiles.aboutMe,
      zoomLink: profiles.zoomLink,
    })
    .from(profiles)
    .where(eq(profiles.userId, viewer.id))
    .limit(1);
  const isCoach = can(viewer, "peernav.coach");
  return {
    name: viewer.name,
    username: viewer.username,
    email: viewer.email,
    timezone: viewer.timezone,
    phone: profile?.phone ?? "",
    phoneDisplay: formatPhone(profile?.phone),
    roleLabel: viewer.roleLabel,
    showPhone: can(viewer, "lp.access") && !viewer.staff,
    showPeerNavProfile: isCoach || can(viewer, "peernav.participant"),
    isCoach,
    peerNav: {
      firstName: profile?.firstName ?? "",
      pronouns: profile?.pronouns ?? "",
      location: profile?.location ?? "",
      aboutMe: profile?.aboutMe ?? "",
      zoomLink: profile?.zoomLink ?? "",
    },
  };
}

/** "Chrome on Windows"-style label from a user agent (no library; good enough for a sessions list). */
export function describeUserAgent(ua: string): { device: string; kind: "phone" | "tablet" | "computer" } {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const kind = /iPad|Tablet/.test(ua) ? "tablet" : /Mobile|iPhone|Android/.test(ua) ? "phone" : "computer";
  const device = browser && os ? `${browser} on ${os}` : (browser ?? os ?? "Unknown device");
  return { device, kind };
}

export async function getSessions(): Promise<
  { id: string; device: string; kind: "phone" | "tablet" | "computer"; lastActive: string; current: boolean }[]
> {
  const requestHeaders = await headers();
  const [sessions, current] = await Promise.all([
    auth.api.listSessions({ headers: requestHeaders }).catch(() => []),
    auth.api.getSession({ headers: requestHeaders }),
  ]);
  return sessions
    .map((session) => ({
      id: String(session.id),
      ...describeUserAgent(session.userAgent ?? ""),
      lastActive: new Date(session.updatedAt ?? session.createdAt).toISOString(),
      current: session.id === current?.session.id,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive));
}
