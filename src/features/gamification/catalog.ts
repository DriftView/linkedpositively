/**
 * Unlockables: avatar packs, badge ("sticker") packs and colour themes.
 * Client-safe (no server imports) so pickers can show locks, but every
 * unlock rule here is enforced again on the server (the old site's locks
 * were CSS-only, docs/legacy/03 §14.8).
 *
 * Images are site-authored assets from the old `avatar_selection` library,
 * copied to public/avatars/<id>.png and public/badges/<id>.png. The old
 * library's pack names did not match its file names, so packs are regrouped
 * by illustration style, keeping 7 avatar packs gated like Engine A
 * (docs/legacy/04 §2.3) and 2 badge packs of 10 (docs/legacy/03 §7.4).
 */

export type AvatarPack = {
  /** 1-based pack number ("Pack 3 of 7"). */
  pack: number;
  name: string;
  /** Level at which the pack unlocks. */
  level: number;
  avatars: string[];
};

const range = (pack: number, count: number) =>
  Array.from({ length: count }, (_, index) => `pack-${pack}-${String(index + 1).padStart(2, "0")}`);

export const AVATAR_PACKS: AvatarPack[] = [
  { pack: 1, name: "Everyday", level: 1, avatars: range(1, 12) },
  { pack: 2, name: "Golden hour", level: 2, avatars: range(2, 12) },
  { pack: 3, name: "Bold & bright", level: 3, avatars: range(3, 12) },
  { pack: 4, name: "Big smiles", level: 4, avatars: range(4, 12) },
  { pack: 5, name: "Sunshine", level: 5, avatars: range(5, 12) },
  { pack: 6, name: "Portraits", level: 6, avatars: range(6, 12) },
  { pack: 7, name: "Line art", level: 6, avatars: range(7, 13) },
];

export type BadgeDef = { id: string; name: string };
export type BadgePack = { pack: number; level: number; badges: BadgeDef[] };

export const BADGE_PACKS: BadgePack[] = [
  {
    pack: 1,
    level: 1,
    badges: [
      { id: "mother-grandmother", name: "Mother / Grandmother" },
      { id: "foodie", name: "Foodie / Special Diet" },
      { id: "book-worm", name: "Book Worm" },
      { id: "religious", name: "Religious" },
      { id: "traveller", name: "Traveller" },
      { id: "self-care-pro", name: "Self Care Pro" },
      { id: "pet-lover", name: "Pet Lover" },
      { id: "social-media-tech-expert", name: "Social Media / Tech Expert" },
      { id: "caregiver", name: "Caregiver" },
      { id: "activist-community-volunteer", name: "Activist / Community Volunteer" },
    ],
  },
  {
    pack: 2,
    level: 3,
    badges: [
      { id: "music-lover", name: "Music Lover" },
      { id: "art-lover", name: "Art Lover" },
      { id: "adap-whiz", name: "ADAP Whiz" },
      { id: "fitness-fanatic", name: "Fitness Fanatic" },
      { id: "mental-health-advocate", name: "Mental Health Advocate" },
      { id: "fashion-star", name: "Fashion Star / Fashionista" },
      { id: "lets-chat", name: "Let's Chat!" },
      { id: "private-person", name: "Private Person" },
      { id: "social-butterfly", name: "Social Butterfly" },
      { id: "beauty-pro", name: "Beauty Pro" },
    ],
  },
];

export const ALL_AVATAR_IDS = AVATAR_PACKS.flatMap((pack) => pack.avatars);
export const ALL_BADGES = BADGE_PACKS.flatMap((pack) => pack.badges);

export function avatarPackOf(avatarId: string) {
  return AVATAR_PACKS.find((pack) => pack.avatars.includes(avatarId)) ?? null;
}

export function badgePackOf(badgeId: string) {
  return BADGE_PACKS.find((pack) => pack.badges.some((badge) => badge.id === badgeId)) ?? null;
}

export function badgeById(badgeId: string) {
  return ALL_BADGES.find((badge) => badge.id === badgeId) ?? null;
}

export function isAvatarUnlocked(avatarId: string, level: number) {
  const pack = avatarPackOf(avatarId);
  return Boolean(pack && level >= pack.level);
}

export function isBadgeUnlocked(badgeId: string, level: number) {
  const pack = badgePackOf(badgeId);
  return Boolean(pack && level >= pack.level);
}

export const avatarSrc = (avatarId: string) => `/avatars/${avatarId}.png`;
export const badgeSrc = (badgeId: string) => `/badges/${badgeId}.png`;

/** Colour themes (legacy field_theme theme-1…4), unlocked at level 6. */
export const COLOR_THEME_LEVEL = 6;
export const COLOR_THEMES = [
  { id: "theme-1", name: "Plum", description: "The classic Link Positively colours.", swatch: ["#682F7C", "#A31058", "#FFC45B"] },
  { id: "theme-2", name: "Dusk", description: "Soft mauve and graphite.", swatch: ["#68505F", "#C9B9C6", "#3B3038"] },
  { id: "theme-3", name: "Lagoon", description: "Teal with sky and blush.", swatch: ["#1D7880", "#5BCFF9", "#FAD4DC"] },
  { id: "theme-4", name: "Harbor", description: "Navy with pink and ice blue.", swatch: ["#2C3E50", "#F5AAB9", "#ADE7FC"] },
] as const;
export type ColorThemeId = (typeof COLOR_THEMES)[number]["id"];
export const COLOR_THEME_IDS = COLOR_THEMES.map((theme) => theme.id) as [ColorThemeId, ...ColorThemeId[]];

/** The theme a user actually sees: their choice only counts from level 6. */
export function effectiveColorTheme(choice: string | null | undefined, level: number): ColorThemeId {
  if (level < COLOR_THEME_LEVEL) return "theme-1";
  return (COLOR_THEME_IDS as string[]).includes(choice ?? "") ? (choice as ColorThemeId) : "theme-1";
}

/**
 * Old library file name → avatar/badge id, for the data migration
 * (`avatar_selection.avatar`; duplicates uploaded under suffixed names map
 * to the same image). Library entries not listed here (origami animals,
 * the flower and bird images) were never offered to participants.
 */
export const LEGACY_AVATAR_FILES: Record<string, string> = {
  "Avatar - Pack 5 - 1-Avatar.png": "pack-1-01",
  "Avatar - Pack 5 - 10-Avatar.png": "pack-1-02",
  "Avatar - Pack 5 - 11-Avatar.png": "pack-1-03",
  "Avatar - Pack 5 - 12-Avatar.png": "pack-1-04",
  "Avatar - Pack 5 - 2-Avatar.png": "pack-1-05",
  "Avatar - Pack 5 - 9-Avatar.png": "pack-1-06",
  "Avatar - Pack 6 - 1.png": "pack-1-07",
  "Avatar - Pack 6 - 2.png": "pack-1-08",
  "Avatar - Pack 6 - 3.png": "pack-1-09",
  "Avatar - Pack 6 - 4.png": "pack-1-10",
  "Avatar - Pack 6 - 5.png": "pack-1-11",
  "Avatar - Pack 6 - 6.png": "pack-1-12",
  "Avatar - Pack 5 - 3.png": "pack-2-01",
  "Avatar - Pack 5 - 4.png": "pack-2-02",
  "Avatar - Pack 5 - 5.png": "pack-2-03",
  "Avatar - Pack 5 - 6.png": "pack-2-04",
  "Avatar - Pack 5 - 7.png": "pack-2-05",
  "Avatar - Pack 5 - 8.png": "pack-2-06",
  "Avatar - Pack 5 - 8_0.png": "pack-2-06",
  "Avatar - Pack 5 - 8_1.png": "pack-2-06",
  "Avatar - Pack 5 - 8_2.png": "pack-2-06",
  "Avatar - Pack 6 - 7.png": "pack-2-07",
  "Avatar - Pack 6 - 8.png": "pack-2-08",
  "Avatar - Pack 6 - 9.png": "pack-2-09",
  "Avatar - Pack 6 - 10.png": "pack-2-10",
  "Avatar - Pack 6 - 10_0.png": "pack-2-10",
  "Avatar - Pack 6 - 11.png": "pack-2-11",
  "Avatar - Pack 6 - 12_0.png": "pack-2-12",
  "Avatar - Pack 6 - 12_1.png": "pack-2-12",
  "Avatar-Pack6-12.png": "pack-2-12",
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`Avatar - Pack 7 - ${i + 1}.png`, `pack-3-${String(i + 1).padStart(2, "0")}`]),
  ),
  "Avatar - Pack 7 - 12_0.png": "pack-3-12",
  "Avatar - Pack 7 - 12_1.png": "pack-3-12",
  "Avatar - Pack 8 - 1.png": "pack-4-01",
  "Avatar - Pack 8 - 3.png": "pack-4-02",
  "Avatar - Pack 8 - 4.png": "pack-4-03",
  "Avatar - Pack 8 - 5.png": "pack-4-04",
  "Avatar - Pack 8 - 6.png": "pack-4-05",
  "Avatar - Pack 8 - 7 (1).png": "pack-4-06",
  "Avatar - Pack 8 - 8.png": "pack-4-07",
  "Avatar - Pack 8 - 9.png": "pack-4-08",
  "Avatar - Pack 8 - 10.png": "pack-4-09",
  "Avatar - Pack 8 - 11 (2).png": "pack-4-10",
  "Avatar - Pack 8 - 12.png": "pack-4-11",
  "Avatar - Pack 8 - 12_0.png": "pack-4-11",
  "Avatar-pack111 - 11.png": "pack-4-12",
  "Group_0.png": "pack-4-12",
  "Group_1.png": "pack-4-12",
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`Avatar - Pack 9 - ${i + 1}.png`, `pack-5-${String(i + 1).padStart(2, "0")}`]),
  ),
  "Avatar - Pack 9 - 10_0.png": "pack-5-10",
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`Avatar - Pack 10 - ${i + 1}.png`, `pack-6-${String(i + 1).padStart(2, "0")}`]),
  ),
  "Avatar - Pack 10 - 8_0.png": "pack-6-08",
  "Avatar - Pack 10 - 9_0.png": "pack-6-09",
  "Group.png": "pack-7-01",
  "Group 2.png": "pack-7-02",
  "Group 4.png": "pack-7-03",
  "Group 5.png": "pack-7-04",
  "Group 6.png": "pack-7-05",
  "Group 7.png": "pack-7-06",
  "Group 8.png": "pack-7-07",
  "Group 9.png": "pack-7-08",
  "Group 10.png": "pack-7-09",
  "Avatar - Pack 5 - 10-Avatar (1).png": "pack-7-10",
  "Avatar - Pack 5 - 2-Avatar_0.png": "pack-7-11",
  "Avatar - Pack 6-1 - 7-Avatar.png": "pack-7-12",
  "Avatar - Pack 5 - 2-Avatar_1.png": "pack-7-12",
  "Avatar - Pack 5 - 9-Avatar (1).png": "pack-7-13",
};

export const LEGACY_BADGE_FILES: Record<string, string> = {
  "Badge - Group 27.png": "mother-grandmother",
  "Badge - Group 7.png": "foodie",
  "Badge - Group 3.png": "book-worm",
  "Badge - Group 5.png": "religious",
  "Badge - Group 6.png": "traveller",
  "Badge - Group 11.png": "self-care-pro",
  "Badge - Group 26.png": "pet-lover",
  "Badge - Group 24.png": "social-media-tech-expert",
  "Badge - Group 22.png": "caregiver",
  "Badge - Group 42.png": "activist-community-volunteer",
  "Badge - Group 2.png": "music-lover",
  "Badge - Group 4.png": "art-lover",
  "Badge - Group 1.png": "adap-whiz",
  "Badge - Group 10.png": "fitness-fanatic",
  "Badge - Group 13.png": "mental-health-advocate",
  "Badge - Group 20.png": "fashion-star",
  "Badge - Group 16.png": "lets-chat",
  "Badge - Group 18.png": "private-person",
  "Badge - Group 19.png": "social-butterfly",
  "Badge - Group 8.png": "beauty-pro",
};
