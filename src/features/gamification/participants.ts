import "server-only";
import { sql } from "drizzle-orm";
import { users } from "@/server/db/schema";

/** `users.role` lists "participant" (roles are a comma-separated list). */
export const PARTICIPANT_ROLE_RE = String.raw`(^|,)\s*participant\s*(,|$)`;

/** Participants who appear on leaderboards and earn daily points (active, not banned). */
export const isActiveParticipant = sql`(${users.role} ~ ${PARTICIPANT_ROLE_RE} and ${users.banned} is not true)`;
