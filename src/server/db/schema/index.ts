/**
 * The whole database schema (Drizzle, PostgreSQL). Import tables and types
 * from here: `import { posts, type Post } from "@/server/db/schema"`.
 * After changing a table run `pnpm db:generate` and commit the new migration.
 */
export { LEGACY_SITES, legacyConflict, type LegacySite, type Photo } from "./_shared";
export * from "./auth";
export * from "./profiles";
export * from "./community";
export * from "./tips";
export * from "./checkin";
export * from "./tracker";
export * from "./gamification";
export * from "./resources";
export * from "./peer-nav";
export * from "./sms";
export * from "./surveys";
export * from "./support";
export * from "./content";
export * from "./system";
export * from "./relations";
