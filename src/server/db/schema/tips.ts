import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  createdAt,
  enumCheck,
  id,
  legacyColumns,
  legacyConstraints,
  rangeCheck,
  timestamps,
  tstz,
  tsvector,
} from "./_shared";
import { users } from "./auth";

/**
 * Tip topics (vocabulary `thrive_tips_tags`) and IMB/AAQ categories
 * (vocabulary `thrive_tips_categories`). Legacy: taxonomy_term_data.
 */
export const TIP_TAG_KINDS = ["tag", "category"] as const;
export type TipTagKind = (typeof TIP_TAG_KINDS)[number];

export const tipTags = pgTable(
  "tip_tags",
  {
    id: id(),
    kind: text().$type<TipTagKind>().notNull().default("tag"),
    name: text().notNull(),
    /** Lower-cased (the app lower-cases before writing). */
    slug: text().notNull(),
    description: text(),
    weight: integer().notNull().default(0),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("tip_tags", t),
    uniqueIndex("tip_tags_kind_slug_uq").on(t.kind, t.slug),
    index("tip_tags_kind_name_idx").on(t.kind, t.name),
    enumCheck("tip_tags_kind_ck", t.kind, TIP_TAG_KINDS),
  ],
);

/**
 * A Thrive Tip (Drupal node type `thrive_tips`). Released to each participant
 * on a study day (see features/tips/schedule.ts) and optionally "recommended"
 * to them by a tailoring rule over their baseline-survey scores.
 * Spec: docs/legacy/02-checkin-and-tips.md §1.
 */
export const TIP_TYPES = ["html", "video", "pdf", "offsite"] as const;
export type TipType = (typeof TIP_TYPES)[number];

/** Legacy `field_template` values, used as layout variants. */
export const TIP_TEMPLATES = [
  "text_linequote",
  "text_blockquote",
  "text_paragraph",
  "image_only",
  "image_text",
  "video_only",
  "video_text",
  "text_bullet",
] as const;
export type TipTemplate = (typeof TIP_TEMPLATES)[number];

/** Legacy `field_user_field` options: baseline-survey score ids (i1…i9, m1…m9, b1…b17). */
export const TAILORING_FIELDS: string[] = [
  ...Array.from({ length: 9 }, (_, i) => `i${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `m${i + 1}`),
  ...Array.from({ length: 17 }, (_, i) => `b${i + 1}`),
];
export const TAILORING_OPERATORS = ["<", ">", "==", "<=", ">=", "!="] as const;
export type TailoringOperator = (typeof TAILORING_OPERATORS)[number];

/** Tailoring rule: recommended when score[field] <operator> value. */
export type TailoringRule = { field: string; operator: TailoringOperator; value: number };

export const tips = pgTable(
  "tips",
  {
    id: id(),
    title: text().notNull(),
    type: text().$type<TipType>().notNull().default("html"),
    template: text().$type<TipTemplate>(),
    /** Body (legacy field_html_content), sanitized with sanitizeStaffHtml. */
    html: text().notNull().default(""),
    /** Short description (legacy field_description) for video/pdf/offsite tips. */
    description: text().notNull().default(""),
    pullquote: text(),
    videoUrl: text(),
    /** Private storage key of the attached PDF. */
    pdfKey: text(),
    pdfName: text(),
    link: text(),

    /** Topic tags (tip_tags.id, kind "tag"). uuid[] with a GIN index: query with arrayContains/arrayOverlaps. */
    tagIds: uuid().array().notNull().default([]),
    categoryId: uuid().references(() => tipTags.id, { onDelete: "set null" }),

    /** Release day in cycle 1 (1–90) and in later cycles (1–90, day 91 = 1). */
    displayDay: integer(),
    displayDayTwo: integer(),

    /** Tailoring rule: recommended when score[field] <operator> value. */
    rule: jsonb().$type<TailoringRule>(),

    published: boolean().notNull().default(true),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),

    /** Plain text of title/description/html/tags, for search. */
    searchText: text().notNull().default(""),
    /**
     * Full-text search (was the Mongo text index `tip_text`, weights title 5 / searchText 1).
     * Generated: never write it. Query with
     * `sql\`${tips.searchVector} @@ websearch_to_tsquery('english', ${q})\`` and rank with
     * `sql\`ts_rank(${tips.searchVector}, websearch_to_tsquery('english', ${q}))\``.
     */
    searchVector: tsvector().generatedAlwaysAs(
      sql`(setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("search_text", '')), 'D'))`,
    ),

    /** Legacy fields with no dedicated home (field_hashtags…), kept for a lossless migration. */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("tips", t),
    index("tips_published_display_day_idx").on(t.published, t.displayDay),
    index("tips_published_display_day_two_idx").on(t.published, t.displayDayTwo),
    index("tips_tag_ids_gin").using("gin", t.tagIds),
    index("tips_search_vector_gin").using("gin", t.searchVector),
    enumCheck("tips_type_ck", t.type, TIP_TYPES),
    enumCheck("tips_template_ck", t.template, TIP_TEMPLATES),
    rangeCheck("tips_display_day_ck", t.displayDay, 1, 90),
    rangeCheck("tips_display_day_two_ck", t.displayDayTwo, 1, 90),
  ],
);

/** A participant's favourite tip (legacy flag `favourites`, fid 10). */
export const tipFavorites = pgTable(
  "tip_favorites",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tipId: uuid()
      .notNull()
      .references(() => tips.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("tip_favorites", t),
    uniqueIndex("tip_favorites_user_tip_uq").on(t.userId, t.tipId),
    index("tip_favorites_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("tip_favorites_tip_idx").on(t.tipId),
  ],
);

/**
 * How often a participant opened a tip (legacy `user_tips_report`, one row per
 * uid/nid with a counter). `recommended` is whether the tip was recommended to
 * them at their first view (replaces the `twm_tailored_tips_tailored` flag in
 * the "tailored tips viewed" report).
 */
export const tipViews = pgTable(
  "tip_views",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** No FK on purpose: view history is research data and outlives a deleted tip. */
    tipId: uuid().notNull(),
    count: integer().notNull().default(1),
    recommended: boolean().notNull().default(false),
    firstViewedAt: tstz().notNull().defaultNow(),
    lastViewedAt: tstz().notNull().defaultNow(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("tip_views", t),
    uniqueIndex("tip_views_user_tip_uq").on(t.userId, t.tipId),
    index("tip_views_tip_idx").on(t.tipId),
    index("tip_views_last_viewed_idx").on(t.lastViewedAt.desc()),
    check("tip_views_count_ck", sql`${t.count} >= 0`),
  ],
);

export type TipTag = typeof tipTags.$inferSelect;
export type NewTipTag = typeof tipTags.$inferInsert;
export type Tip = typeof tips.$inferSelect;
export type NewTip = typeof tips.$inferInsert;
export type TipFavorite = typeof tipFavorites.$inferSelect;
export type NewTipFavorite = typeof tipFavorites.$inferInsert;
export type TipView = typeof tipViews.$inferSelect;
export type NewTipView = typeof tipViews.$inferInsert;
