import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, enumCheck, id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

export const PN_SESSION_STATUSES = ["not_started", "in_progress", "complete"] as const;
export type PnSessionStatus = (typeof PN_SESSION_STATUSES)[number];

/**
 * A participant's progress on one coaching session (Drupal `ecoach_session_data`).
 * One row per (participant, serial). Serials 1–6 are the current
 * curriculum; 7–10 exist only as migrated, read-only history.
 *
 * A row can exist before the session is started: reordering the plan
 * stores `order` for every session (legacy rows with `created` NULL).
 */
export const pnSessions = pgTable(
  "peer_nav_sessions",
  {
    id: id(),
    participantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serial: integer().notNull(),
    /** Display order chosen by the coach (legacy `weight`); also used on the participant's plan. */
    order: integer().notNull(),
    status: text().$type<PnSessionStatus>().notNull().default("not_started"),
    /** When the coach started the session (legacy `created`). */
    startedAt: tstz(),
    /** When the session was marked complete (legacy `date`). Cleared if completion is undone. */
    completedAt: tstz(),
    /** Last start, save, completion or reorder. */
    lastActivityAt: tstz(),
    /** Coach who created the row (legacy `aid`). */
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Legacy unused `goals` blob and other leftovers, kept for a lossless migration. */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("peer_nav_sessions", t),
    uniqueIndex("peer_nav_sessions_participant_serial_uq").on(t.participantId, t.serial),
    index("peer_nav_sessions_participant_order_idx").on(t.participantId, t.order),
    enumCheck("peer_nav_sessions_status_ck", t.status, PN_SESSION_STATUSES),
    rangeCheck("peer_nav_sessions_serial_ck", t.serial, 1, 99),
  ],
);

/**
 * One saved copy of a session checklist (Drupal `ecoach_session_log`). Every
 * Save creates a new, immutable revision; the form is pre-filled from the
 * latest one. `answers` keeps the legacy form keys (intro_check1, intro_text1,
 * session_start_time, general, session, session_time, phone, video…):
 * checkboxes are booleans, everything else strings ("1" Yes / "2" No for radios).
 *
 * Revisions are history: a database trigger rejects UPDATE (migration 0001).
 * Re-runnable imports must use `onConflictDoNothing`.
 */
export const pnSessionRevisions = pgTable(
  "peer_nav_session_revisions",
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => pnSessions.id, { onDelete: "cascade" }),
    participantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serial: integer().notNull(),
    /** The coach who saved it. Missing only on migrated rows where it can't be known. */
    coachId: uuid().references(() => users.id, { onDelete: "set null" }),
    answers: jsonb().$type<Record<string, string | boolean>>().notNull().default({}),
    /** Value of the "This session is complete" toggle at save time. */
    complete: boolean().notNull().default(false),
    createdAt: createdAt(),
    /** Drupal form noise / unmapped keys from migrated blobs. */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("peer_nav_session_revisions", t),
    index("peer_nav_session_revisions_session_created_idx").on(t.sessionId, t.createdAt.desc()),
    index("peer_nav_session_revisions_participant_created_idx").on(t.participantId, t.createdAt.desc()),
  ],
);

export const PN_CONTACT_METHODS = ["voice", "voicemail", "sms", "email"] as const;
export type PnContactMethod = (typeof PN_CONTACT_METHODS)[number];

/**
 * A coach's contact note about a participant (Drupal `notes` nodes). Either a
 * general note or attached to a session (legacy title "1".."6").
 */
export const pnNotes = pgTable(
  "peer_nav_notes",
  {
    id: id(),
    participantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The coach who wrote it. Missing on migrated notes (Drupal stored the participant as author). */
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Session serial for session notes, null for general notes. */
    sessionSerial: integer(),
    sessionId: uuid().references(() => pnSessions.id, { onDelete: "set null" }),
    /** The session save that created the note (legacy field_session_ref held a log id). */
    revisionId: uuid().references(() => pnSessionRevisions.id, { onDelete: "set null" }),
    text: text().notNull(),
    methodOfContact: text().$type<PnContactMethod>(),
    deletedAt: tstz(),
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("peer_nav_notes", t),
    index("peer_nav_notes_participant_deleted_created_idx").on(t.participantId, t.deletedAt, t.createdAt.desc()),
    index("peer_nav_notes_participant_serial_created_idx").on(t.participantId, t.sessionSerial, t.createdAt.desc()),
    enumCheck("peer_nav_notes_method_ck", t.methodOfContact, PN_CONTACT_METHODS),
  ],
);

/**
 * A file shared between a participant and their coach (Drupal managed files
 * with usage `user_attachments`, stored in private://user_attachments/{uid}).
 * Stored privately; downloaded through short-lived signed URLs.
 */
export const pnFiles = pgTable(
  "peer_nav_files",
  {
    id: id(),
    /** Whose file space it belongs to. */
    participantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null once the uploader's account is deleted. */
    uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    filename: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    storageKey: text().notNull(),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("peer_nav_files", t),
    index("peer_nav_files_participant_created_idx").on(t.participantId, t.createdAt.desc()),
  ],
);

/**
 * History of coach assignments. The current assignment lives on
 * `profiles.coachId`; every change made through "Coach assignments" is
 * appended here (the old site kept no history).
 */
export const pnCoachAssignments = pgTable(
  "peer_nav_coach_assignments",
  {
    id: id(),
    participantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** New coach; null when the assignment was removed. */
    coachId: uuid().references(() => users.id, { onDelete: "set null" }),
    previousCoachId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Staff member who made the change (null once their account is deleted). */
    assignedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("peer_nav_coach_assignments", t),
    index("peer_nav_coach_assignments_participant_created_idx").on(t.participantId, t.createdAt.desc()),
    index("peer_nav_coach_assignments_created_idx").on(t.createdAt.desc()),
  ],
);

/**
 * A Peer Navigation conversation between a participant and their coach
 * (Drupal privatemsg threads). Per-member state (read and "deleted for me"
 * markers) lives in `messageThreadMembers`, so deleting only hides the thread
 * for that person; a newer message makes it reappear (privatemsg behaviour).
 *
 * The coach can't be deleted while they have threads (`restrict`): reassign or
 * archive first, so a participant never loses their conversation.
 */
export const messageThreads = pgTable(
  "message_threads",
  {
    id: id(),
    participantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coachId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subject: text().notNull().default(""),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: tstz().notNull().defaultNow(),
    lastAuthorId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("message_threads", t),
    index("message_threads_participant_coach_last_idx").on(t.participantId, t.coachId, t.lastMessageAt.desc()),
  ],
);

/**
 * One member of a thread (was the `members` subdocument array, index
 * "members.userId"). One row per (thread, user). Find a user's threads with
 * `innerJoin(messageThreadMembers, and(eq(messageThreadMembers.threadId, messageThreads.id), eq(messageThreadMembers.userId, me)))`.
 */
export const messageThreadMembers = pgTable(
  "message_thread_members",
  {
    id: id(),
    threadId: uuid()
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: tstz(),
    /** Messages up to this moment are hidden for this member. */
    deletedAt: tstz(),
  },
  (t) => [
    uniqueIndex("message_thread_members_thread_user_uq").on(t.threadId, t.userId),
    index("message_thread_members_user_idx").on(t.userId),
  ],
);

/** One message in a Peer Navigation conversation (Drupal `pm_message`). Plain text. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    threadId: uuid()
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    /** Members who deleted this message for themselves (legacy pm_index.deleted). */
    deletedFor: uuid().array().notNull().default([]),
    createdAt: createdAt(),
    /** Legacy subject/format/has_tokens. */
    extra: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
  },
  (t) => [
    ...legacyConstraints("messages", t),
    index("messages_thread_created_idx").on(t.threadId, t.createdAt),
    index("messages_author_created_idx").on(t.authorId, t.createdAt.desc()),
  ],
);

export type PnSession = typeof pnSessions.$inferSelect;
export type NewPnSession = typeof pnSessions.$inferInsert;
export type PnSessionRevision = typeof pnSessionRevisions.$inferSelect;
export type NewPnSessionRevision = typeof pnSessionRevisions.$inferInsert;
export type PnNote = typeof pnNotes.$inferSelect;
export type NewPnNote = typeof pnNotes.$inferInsert;
export type PnFile = typeof pnFiles.$inferSelect;
export type NewPnFile = typeof pnFiles.$inferInsert;
export type PnCoachAssignment = typeof pnCoachAssignments.$inferSelect;
export type NewPnCoachAssignment = typeof pnCoachAssignments.$inferInsert;
export type MessageThread = typeof messageThreads.$inferSelect;
export type NewMessageThread = typeof messageThreads.$inferInsert;
export type MessageThreadMember = typeof messageThreadMembers.$inferSelect;
export type NewMessageThreadMember = typeof messageThreadMembers.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
