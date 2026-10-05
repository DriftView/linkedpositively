import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, enumCheck, id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

/** Resource tags (Drupal vocabulary `resource_tags`, free tagging). */
export const resourceTags = pgTable(
  "resource_tags",
  {
    id: id(),
    name: text().notNull(),
    /** Lower-cased name: "HIV testing" and "hiv testing" are one tag. */
    key: text().notNull().unique(),
    slug: text().notNull().unique(),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [...legacyConstraints("resource_tags", t)],
);

export const RESOURCE_STATUSES = ["published", "suggested", "unpublished"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const GEOCODE_STATUSES = ["ok", "pending", "failed", "none"] as const;
export type GeocodeStatus = (typeof GEOCODE_STATUSES)[number];

/**
 * A place in the resource locator (Drupal node type `resources`, module
 * `techstep_location`). The geocode cache that lived in `ts_locations` is
 * `lat`/`lng` here, so deleting a resource removes its location.
 *
 * Status: `published` (visible), `suggested` (sent by a participant through
 * "Suggest a resource", waiting for review) or `unpublished` (hidden by staff).
 *
 * Mongo → Postgres: the GeoJSON `location: { type: "Point", coordinates: [lng, lat] }`
 * is `lat` + `lng` (double precision, both or neither; no PostGIS). Distance in
 * metres: `sql\`6371000 * 2 * asin(sqrt(power(sin(radians(${resources.lat} - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(${resources.lat})) * power(sin(radians(${resources.lng} - ${lng}) / 2), 2)))\``
 * (pre-filter with a lat/lng bounding box to use `resources_lat_lng_idx`).
 * The `geocode: { status, at, source }` subdocument is `geocodeStatus`, `geocodeAt`, `geocodeSource`.
 * Case-insensitive title sort (was a Mongo collation): `orderBy(sql\`lower(${resources.title})\`)`.
 */
export const resources = pgTable(
  "resources",
  {
    id: id(),
    title: text().notNull(), // Drupal title ("Organization")
    description: text(), // field_resource_description
    address: text(), // field_address
    city: text(), // field_city
    state: text(), // field_state
    zip: text(), // field_zip
    website: text(), // field_website
    contact: text(), // field_contact (phone/email, free text)
    hours: text(), // field_hours
    eligibility: text(), // field_eligibility
    scheduling: text(), // field_scheduling
    covidUpdates: text(), // field_status ("Covid-19 Updates"; CSV "Patient Status")
    insuranceStatus: text(), // field_tests ("Insurance Status"; CSV "Rapid Tests Available")
    services: text(), // field_resource_tags (text; CSV "Other Services")
    /** field_resource_tag → resource_tags.id. uuid[] with a GIN index (arrayContains/arrayOverlaps). */
    tagIds: uuid().array().notNull().default([]),

    /** Was location.coordinates[1] / [0]. */
    lat: doublePrecision(),
    lng: doublePrecision(),
    geocodeStatus: text().$type<GeocodeStatus>().notNull().default("none"),
    geocodeAt: tstz(),
    /** "google" | "manual" | "import" | "legacy" | "seed" */
    geocodeSource: text(),

    status: text().$type<ResourceStatus>().notNull().default("published"),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Participant who suggested it (Drupal: unpublished node owned by the user). */
    suggestedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    publishedAt: tstz(),
    /** Feeds GUID (CSV "Serial No"): re-importing the same file never duplicates. */
    importGuid: text(),

    // Denormalized counters, recomputed from their source tables on change.
    ratingCount: integer().notNull().default(0),
    ratingAverage: doublePrecision().notNull().default(0),
    favoriteCount: integer().notNull().default(0),
    openReportCount: integer().notNull().default(0),

    /** Data the old site stored that the UI doesn't use (never dropped). */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("resources", t),
    index("resources_lat_lng_idx")
      .on(t.lat, t.lng)
      .where(sql`${t.lat} is not null`),
    index("resources_status_title_idx").on(t.status, sql`lower(${t.title})`),
    index("resources_status_open_reports_idx").on(t.status, t.openReportCount.desc()),
    index("resources_status_zip_idx").on(t.status, t.zip),
    index("resources_status_city_idx").on(t.status, t.city),
    index("resources_status_created_idx").on(t.status, t.createdAt.desc()),
    index("resources_tag_ids_gin").using("gin", t.tagIds),
    index("resources_geocode_status_idx").on(t.geocodeStatus),
    uniqueIndex("resources_import_guid_uq")
      .on(t.importGuid)
      .where(sql`${t.importGuid} is not null`),
    enumCheck("resources_status_ck", t.status, RESOURCE_STATUSES),
    enumCheck("resources_geocode_status_ck", t.geocodeStatus, GEOCODE_STATUSES),
    check("resources_lat_lng_ck", sql`(${t.lat} is null) = (${t.lng} is null)`),
    rangeCheck("resources_lat_ck", t.lat, -90, 90),
    rangeCheck("resources_lng_ck", t.lng, -180, 180),
  ],
);

/** A participant's saved resource (Drupal flag `favorite_resource`, fid 39). */
export const resourceFavorites = pgTable(
  "resource_favorites",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("resource_favorites", t),
    uniqueIndex("resource_favorites_user_resource_uq").on(t.userId, t.resourceId),
    index("resource_favorites_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("resource_favorites_resource_idx").on(t.resourceId),
  ],
);

/**
 * A star rating (Drupal Fivestar `field_rating` through VotingAPI: 5 stars,
 * re-voting allowed). One per user and resource; rating again updates it.
 */
export const resourceRatings = pgTable(
  "resource_ratings",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    value: integer().notNull(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("resource_ratings", t),
    uniqueIndex("resource_ratings_user_resource_uq").on(t.userId, t.resourceId),
    index("resource_ratings_resource_idx").on(t.resourceId),
    rangeCheck("resource_ratings_value_ck", t.value, 1, 5),
  ],
);

export const RESOURCE_REPORT_REASONS = ["closed", "wrong_info", "not_helpful", "other"] as const;
export type ResourceReportReason = (typeof RESOURCE_REPORT_REASONS)[number];
export const RESOURCE_REPORT_RESOLUTIONS = ["unpublished", "dismissed", "deleted"] as const;
export type ResourceReportResolution = (typeof RESOURCE_REPORT_RESOLUTIONS)[number];

/**
 * A participant's report that a resource is out of date (Drupal flag
 * `resource`, "No Longer Available"; reviewed at admin/flagged-resources).
 * One per user and resource.
 */
export const resourceReports = pgTable(
  "resource_reports",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    reason: text().$type<ResourceReportReason>().notNull().default("closed"),
    note: text(),
    createdAt: createdAt(),
    resolvedAt: tstz(),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** What staff did about it. */
    resolution: text().$type<ResourceReportResolution>(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("resource_reports", t),
    uniqueIndex("resource_reports_user_resource_uq").on(t.userId, t.resourceId),
    index("resource_reports_resource_resolved_idx").on(t.resourceId, t.resolvedAt),
    enumCheck("resource_reports_reason_ck", t.reason, RESOURCE_REPORT_REASONS),
    enumCheck("resource_reports_resolution_ck", t.resolution, RESOURCE_REPORT_RESOLUTIONS),
  ],
);

export type ResourceTag = typeof resourceTags.$inferSelect;
export type NewResourceTag = typeof resourceTags.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type ResourceFavorite = typeof resourceFavorites.$inferSelect;
export type NewResourceFavorite = typeof resourceFavorites.$inferInsert;
export type ResourceRating = typeof resourceRatings.$inferSelect;
export type NewResourceRating = typeof resourceRatings.$inferInsert;
export type ResourceReport = typeof resourceReports.$inferSelect;
export type NewResourceReport = typeof resourceReports.$inferInsert;
