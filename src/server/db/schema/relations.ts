import { relations } from "drizzle-orm";
import { accounts, sessions, users } from "./auth";
import { comments, posts } from "./community";
import { journeyCategories, journeyGoals, journeyMethods } from "./content";
import { messages, messageThreadMembers, messageThreads, pnSessionRevisions, pnSessions } from "./peer-nav";
import { profiles } from "./profiles";
import { tips, tipTags } from "./tips";
import { trackerEntries, trackers } from "./tracker";

/**
 * Relations for `db.query.<table>.findMany({ with: … })`. Only the common
 * joins are declared; most queries use explicit selects/joins instead.
 */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  tip: one(tips, { fields: [posts.tipId], references: [tips.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const tipsRelations = relations(tips, ({ one }) => ({
  category: one(tipTags, { fields: [tips.categoryId], references: [tipTags.id] }),
}));

export const trackersRelations = relations(trackers, ({ many }) => ({
  entries: many(trackerEntries),
}));

export const trackerEntriesRelations = relations(trackerEntries, ({ one }) => ({
  tracker: one(trackers, { fields: [trackerEntries.trackerId], references: [trackers.id] }),
}));

export const journeyCategoriesRelations = relations(journeyCategories, ({ many }) => ({
  methods: many(journeyMethods),
}));

export const journeyMethodsRelations = relations(journeyMethods, ({ one, many }) => ({
  category: one(journeyCategories, { fields: [journeyMethods.categoryId], references: [journeyCategories.id] }),
  goals: many(journeyGoals),
}));

export const journeyGoalsRelations = relations(journeyGoals, ({ one }) => ({
  method: one(journeyMethods, { fields: [journeyGoals.methodId], references: [journeyMethods.id] }),
}));

export const pnSessionsRelations = relations(pnSessions, ({ many }) => ({
  revisions: many(pnSessionRevisions),
}));

export const pnSessionRevisionsRelations = relations(pnSessionRevisions, ({ one }) => ({
  session: one(pnSessions, { fields: [pnSessionRevisions.sessionId], references: [pnSessions.id] }),
}));

export const messageThreadsRelations = relations(messageThreads, ({ many }) => ({
  members: many(messageThreadMembers),
  messages: many(messages),
}));

export const messageThreadMembersRelations = relations(messageThreadMembers, ({ one }) => ({
  thread: one(messageThreads, { fields: [messageThreadMembers.threadId], references: [messageThreads.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(messageThreads, { fields: [messages.threadId], references: [messageThreads.id] }),
}));
