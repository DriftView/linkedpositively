/**
 * Levels from total points. The old site ran two conflicting level tables;
 * this uses the one that actually unlocked features ("Engine A",
 * docs/legacy/04 §2.3). Unlocks are cumulative: reaching level 4 also gives
 * everything from levels 2 and 3.
 */

export type LevelInfo = {
  level: number;
  /** Points at which this level starts. */
  min: number;
  /** Points needed for the next level, or null at the top level. */
  next: number | null;
  headline: string;
  unlocks: string[];
};

export const LEVELS: LevelInfo[] = [
  {
    level: 1,
    min: 0,
    next: 201,
    headline: "Welcome! Interact with the app to earn points and go up levels.",
    unlocks: ["Avatar pack 1", "Badges pack 1"],
  },
  {
    level: 2,
    min: 201,
    next: 500,
    headline: "At Level 2 you unlock new options for customizing your profile!",
    unlocks: ["Avatar pack 2"],
  },
  {
    level: 3,
    min: 500,
    next: 900,
    headline: "At Level 3 you unlock new avatar options!",
    unlocks: ["Avatar pack 3", "Badges pack 2"],
  },
  {
    level: 4,
    min: 900,
    next: 1400,
    headline: "At Level 4 you unlock new wall features to use when posting!",
    unlocks: ["Avatar pack 4"],
  },
  {
    level: 5,
    min: 1400,
    next: 2000,
    headline: "At Level 5 you unlock new avatar options!",
    unlocks: ["Avatar pack 5"],
  },
  {
    level: 6,
    min: 2000,
    next: null,
    headline: "At Level 6 you unlock new color themes for the app!",
    unlocks: ["Avatar packs 6 and 7", "Colour themes"],
  },
];

export const MAX_LEVEL = LEVELS.length;

export function levelForPoints(points: number): LevelInfo {
  let current = LEVELS[0];
  for (const level of LEVELS) if (points >= level.min) current = level;
  return current;
}

/** 0–1 progress through the current level. */
export function levelProgress(points: number) {
  const info = levelForPoints(points);
  if (info.next === null) return 1;
  return Math.min(1, Math.max(0, (points - info.min) / (info.next - info.min)));
}

/** Points still needed to reach the next level, or null at the top level. */
export function pointsToNextLevel(points: number) {
  const info = levelForPoints(points);
  return info.next === null ? null : Math.max(0, info.next - points);
}

/** How to earn points (shown on the levels page). */
export const HOW_TO_LEVEL_UP =
  "Log in daily, complete your check-ins and surveys, post and comment on the wall, and read your tips.";

/**
 * Default level copy (legacy `level{n}-name` / `level{n}-desc`, lightly
 * edited: the old level 1 text still said "YouTHrive" and had a typo).
 * Staff can change it at /admin/content/levels.
 */
export const DEFAULT_LEVEL_COPY: Record<number, { headline: string; description: string }> = {
  1: {
    headline: "Welcome to Link Positively! Interact with different parts of the app to earn points and go up levels.",
    description: "Complete your profile, post and comment on the wall, read your tips and do your daily check-ins.",
  },
  2: {
    headline: "At Level 2 you unlock new options for customizing your profile!",
    description: "Complete your profile, post and comment on the wall, read your tips and do your daily check-ins.",
  },
  3: {
    headline: "At Level 3 you unlock new avatar options!",
    description: "Complete your profile, log in daily, post and comment on the wall, read your tips and do your daily check-ins.",
  },
  4: {
    headline: "At Level 4 you unlock new wall features to use when posting!",
    description: "Log in daily, complete your midpoint survey, post and comment on the wall, read your tips and do your daily check-ins.",
  },
  5: {
    headline: "At Level 5 you unlock new avatar options!",
    description: "Log in daily, complete your midpoint survey, post and comment on the wall, read your tips and do your daily check-ins.",
  },
  6: {
    headline: "At Level 6 you unlock new color themes for the app!",
    description: "Log in daily, complete your midpoint survey, post and comment on the wall, read your tips and do your daily check-ins.",
  },
};
