import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { enumCheck, id, legacyColumns, legacyConstraints, timestamps, tstz } from "./_shared";
import { users } from "./auth";

export const SUPPORT_TOPICS = ["login", "app", "notifications", "sms", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export const SUPPORT_STATUSES = ["open", "in_progress", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/**
 * A tech support request (Drupal node type `tech_support`, "TWM Feedback
 * Form": title forced to "Tech Support Feedback", body in `field_body`).
 * Staff work the queue at /admin/support.
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text().$type<SupportTopic>().notNull().default("other"),
    /** Drupal node title (always "Tech Support Feedback" for participants). */
    title: text().notNull().default("Tech Support Feedback"),
    body: text().notNull(),
    /** Browser/device summary the participant chose to include. */
    device: text(),
    status: text().$type<SupportStatus>().notNull().default("open"),
    /** Internal notes, staff only. */
    staffNote: text(),
    /** Message shown to the participant with the status. */
    reply: text(),
    handledBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("support_tickets", t),
    index("support_tickets_status_created_idx").on(t.status, t.createdAt.desc()),
    index("support_tickets_user_created_idx").on(t.userId, t.createdAt.desc()),
    enumCheck("support_tickets_topic_ck", t.topic, SUPPORT_TOPICS),
    enumCheck("support_tickets_status_ck", t.status, SUPPORT_STATUSES),
  ],
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
