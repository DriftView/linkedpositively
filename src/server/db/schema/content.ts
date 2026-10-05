import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { enumCheck, id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

export const PAGE_STATUSES = ["published", "draft"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];
export const PAGE_AUDIENCES = ["everyone", "staff"] as const;
export type PageAudience = (typeof PAGE_AUDIENCES)[number];

/**
 * Static information pages (Drupal `public_page`: About, FAQ, Help, Community
 * Guidelines, Terms & Disclosure…, and the internal `page` how-tos, which
 * become `audience: "staff"`). Addressed by slug at /pages/[slug].
 * `slug` is trimmed and lower-cased by the app before writing.
 */
export const pages = pgTable(
  "pages",
  {
    id: id(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    /** One-line summary for the pages index and link previews. */
    summary: text(),
    /** Sanitized with sanitizeStaffHtml before storing. */
    bodyHtml: text().notNull().default(""),
    /** Drupal `field_video_link` (YouTube/Vimeo) on basic pages. */
    videoUrl: text(),
    status: text().$type<PageStatus>().notNull().default("published"),
    audience: text().$type<PageAudience>().notNull().default("everyone"),
    /** Listed on the "Help & info" index, in this order (Drupal "About" menu). */
    inMenu: boolean().notNull().default(true),
    order: integer().notNull().default(0),
    /** Seeded or migrated copy that staff still need to check. */
    needsReview: boolean().notNull().default(false),
    /** Legacy aliases (e.g. "about/support") for redirects. GIN-indexed: `arrayContains(pages.aliases, [alias])`. */
    aliases: text().array().notNull().default([]),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("pages", t),
    index("pages_status_menu_order_idx").on(t.status, t.inMenu, t.order),
    index("pages_aliases_gin").using("gin", t.aliases),
    enumCheck("pages_status_ck", t.status, PAGE_STATUSES),
    enumCheck("pages_audience_ck", t.audience, PAGE_AUDIENCES),
  ],
);

/**
 * A glossary entry (Drupal vocabulary `glossary_terms`, page /yt-glossary):
 * term name + definition HTML (sanitizeStaffHtml).
 */
export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    id: id(),
    name: text().notNull(),
    /** Anchor id on /glossary, unique. */
    slug: text().notNull().unique(),
    /** Upper-case first letter (A–Z) or "#" for anything else. */
    letter: text().notNull(),
    definitionHtml: text().notNull().default(""),
    /** Plain-text copy of the definition, for search. */
    definitionText: text().notNull().default(""),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [...legacyConstraints("glossary_terms", t), index("glossary_terms_letter_name_idx").on(t.letter, t.name)],
);

export const JOURNEY_ACCENTS = ["plum", "magenta", "sky", "apricot", "pink"] as const;
export type JourneyAccent = (typeof JOURNEY_ACCENTS)[number];

/**
 * Journey content, three levels deep (Drupal `youthrive_journey_efm`, never
 * switched on in production but its content exists):
 *   category (`journey_category`, e.g. "Health")
 *     → method (`journey_methods`, "I want to feel more in control of my own health")
 *       → goal (`journey_goals`, a concrete goal a participant can take on).
 */
export const journeyCategories = pgTable(
  "journey_categories",
  {
    id: id(),
    name: text().notNull(), // field_journey_category_name / title
    slug: text().notNull().unique(),
    description: text(),
    /** Accent: one of the brand colours (plum, magenta, sky, apricot, pink). */
    accent: text().$type<JourneyAccent>().notNull().default("plum"),
    order: integer().notNull().default(0),
    published: boolean().notNull().default(true),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("journey_categories", t),
    index("journey_categories_published_order_idx").on(t.published, t.order),
    enumCheck("journey_categories_accent_ck", t.accent, JOURNEY_ACCENTS),
  ],
);

export const journeyMethods = pgTable(
  "journey_methods",
  {
    id: id(),
    categoryId: uuid() // field_journey_category
      .notNull()
      .references(() => journeyCategories.id, { onDelete: "cascade" }),
    name: text().notNull(), // field_journey_method_name
    order: integer().notNull().default(0),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("journey_methods", t),
    index("journey_methods_category_order_idx").on(t.categoryId, t.order),
  ],
);

export const journeyGoals = pgTable(
  "journey_goals",
  {
    id: id(),
    methodId: uuid() // field_journey_method
      .notNull()
      .references(() => journeyMethods.id, { onDelete: "cascade" }),
    name: text().notNull(), // field_journey_goal_name
    order: integer().notNull().default(0),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [...legacyConstraints("journey_goals", t), index("journey_goals_method_order_idx").on(t.methodId, t.order)],
);

/**
 * A participant's personal goal (Drupal node type `user_goals`). Either picked
 * from the journey content (category → method → goal, names copied so they
 * survive content edits) or written in their own words (`ownCategory`,
 * `ownGoal`). Private to its owner. Step labels: JOURNEY_STEPS in features/journey/steps.ts.
 */
export const journeyUserGoals = pgTable(
  "journey_user_goals",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => journeyCategories.id, { onDelete: "set null" }), // field_user_category_id
    categoryName: text(), // field_user_goal_category_name
    methodId: uuid().references(() => journeyMethods.id, { onDelete: "set null" }), // field_user_method_id
    methodName: text(), // field_user_goal_method_name
    /**
     * field_user_goal_id. No FK on purpose: a goal picked from the catalog stays
     * a catalog goal (`own: false`) after staff delete it; goalName keeps the copy.
     */
    goalId: uuid(),
    goalName: text(), // field_user_goal_name
    ownCategory: text(), // field_own_category
    ownGoal: text(), // field_own_goals
    /** 1–7, see JOURNEY_STEPS (Drupal field_goal_step "STEP 3"). */
    step: integer().notNull().default(1),
    currentStepNote: text(), // field_goal_current_step_descript
    nextStepNote: text(), // field_goal_next_step_description
    /** "Accomplish this goal in" (free text in Drupal, e.g. "2 weeks"). */
    goalIn: text(), // field_goal_in
    targetDate: tstz(), // field_goal_end_date
    percentage: integer(), // field_goal_percentage
    dismissed: boolean().notNull().default(false), // field_dismiss
    completedAt: tstz(),
    /** How many times the participant updated this goal (Drupal user_goals_reported.count). */
    updateCount: integer().notNull().default(0),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("journey_user_goals", t),
    index("journey_user_goals_user_dismissed_created_idx").on(t.userId, t.dismissed, t.createdAt.desc()),
    rangeCheck("journey_user_goals_step_ck", t.step, 1, 7),
    rangeCheck("journey_user_goals_percentage_ck", t.percentage, 0, 100),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type GlossaryTerm = typeof glossaryTerms.$inferSelect;
export type NewGlossaryTerm = typeof glossaryTerms.$inferInsert;
export type JourneyCategory = typeof journeyCategories.$inferSelect;
export type NewJourneyCategory = typeof journeyCategories.$inferInsert;
export type JourneyMethod = typeof journeyMethods.$inferSelect;
export type NewJourneyMethod = typeof journeyMethods.$inferInsert;
export type JourneyGoal = typeof journeyGoals.$inferSelect;
export type NewJourneyGoal = typeof journeyGoals.$inferInsert;
export type JourneyUserGoal = typeof journeyUserGoals.$inferSelect;
export type NewJourneyUserGoal = typeof journeyUserGoals.$inferInsert;
