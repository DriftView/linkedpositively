import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_AVATAR_IDS,
  ALL_BADGES,
  LEGACY_AVATAR_FILES,
  LEGACY_BADGE_FILES,
  effectiveColorTheme,
  isAvatarUnlocked,
  isBadgeUnlocked,
} from "./catalog";

describe("unlocks", () => {
  it("gates avatar packs by level", () => {
    expect(isAvatarUnlocked("pack-1-01", 1)).toBe(true);
    expect(isAvatarUnlocked("pack-2-01", 1)).toBe(false);
    expect(isAvatarUnlocked("pack-2-01", 2)).toBe(true);
    expect(isAvatarUnlocked("pack-7-13", 5)).toBe(false);
    expect(isAvatarUnlocked("pack-7-13", 6)).toBe(true);
    expect(isAvatarUnlocked("pack-9-01", 6)).toBe(false);
  });

  it("locks badge pack 2 until level 3", () => {
    expect(isBadgeUnlocked("book-worm", 1)).toBe(true);
    expect(isBadgeUnlocked("music-lover", 2)).toBe(false);
    expect(isBadgeUnlocked("music-lover", 3)).toBe(true);
    expect(isBadgeUnlocked("nope", 6)).toBe(false);
  });

  it("only applies colour themes from level 6", () => {
    expect(effectiveColorTheme("theme-3", 5)).toBe("theme-1");
    expect(effectiveColorTheme("theme-3", 6)).toBe("theme-3");
    expect(effectiveColorTheme("bogus", 6)).toBe("theme-1");
  });
});

describe("assets", () => {
  it("has an image for every avatar and badge, and legacy files map to real ids", () => {
    for (const id of ALL_AVATAR_IDS) expect(existsSync(path.join("public/avatars", `${id}.png`)), id).toBe(true);
    for (const badge of ALL_BADGES) expect(existsSync(path.join("public/badges", `${badge.id}.png`)), badge.id).toBe(true);
    for (const id of Object.values(LEGACY_AVATAR_FILES)) expect(ALL_AVATAR_IDS).toContain(id);
    for (const id of Object.values(LEGACY_BADGE_FILES)) expect(ALL_BADGES.map((badge) => badge.id)).toContain(id);
  });
});
