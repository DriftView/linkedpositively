import "server-only";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";
import { supportTickets, users, type SupportStatus, type SupportTopic } from "@/server/db/schema";
import { primaryRoleLabel, parseRoles } from "@/server/auth/roles";

export type MyTicketDTO = {
  id: string;
  topic: SupportTopic;
  body: string;
  status: SupportStatus;
  reply: string;
  createdAt: string;
  updatedAt: string;
};

export async function listMyTickets(userId: string): Promise<MyTicketDTO[]> {
  const docs = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.createdAt), desc(supportTickets.id))
    .limit(20);
  return docs.map((doc) => ({
    id: doc.id,
    topic: doc.topic,
    body: doc.body,
    status: doc.status,
    reply: doc.reply ?? "",
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

export type AdminTicketDTO = MyTicketDTO & {
  device: string;
  staffNote: string;
  user: { id: string; name: string; username: string; roleLabel: string; email: string };
  handledByName: string | null;
  resolvedAt: string | null;
};

export async function adminTicketCounts() {
  const rows = await db.select({ status: supportTickets.status, n: count() }).from(supportTickets).groupBy(supportTickets.status);
  const counts: Record<SupportStatus, number> = { open: 0, in_progress: 0, resolved: 0 };
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

/** The staff queue. Staff see the member's name and email so they can follow up. */
export async function adminListTickets(input: { status: SupportStatus | "all"; page?: number }) {
  const perPage = 30;
  const page = Math.max(1, input.page ?? 1);
  const where = input.status === "all" ? undefined : eq(supportTickets.status, input.status);
  const handlers = alias(users, "handler");
  const order =
    input.status === "resolved"
      ? [sql`${supportTickets.resolvedAt} desc nulls last`, desc(supportTickets.updatedAt), desc(supportTickets.id)]
      : input.status === "all"
        ? [desc(supportTickets.createdAt), desc(supportTickets.id)]
        : [asc(supportTickets.createdAt), asc(supportTickets.id)];
  const [docs, [{ total }]] = await Promise.all([
    db
      .select({
        ticket: supportTickets,
        user: { name: users.name, username: users.username, email: users.email, role: users.role },
        handler: { name: handlers.name, username: handlers.username },
      })
      .from(supportTickets)
      .leftJoin(users, eq(users.id, supportTickets.userId))
      .leftJoin(handlers, eq(handlers.id, supportTickets.handledBy))
      .where(where)
      .orderBy(...order)
      .offset((page - 1) * perPage)
      .limit(perPage),
    db.select({ total: count() }).from(supportTickets).where(where),
  ]);
  const tickets: AdminTicketDTO[] = docs.map(({ ticket: doc, user, handler }) => {
    return {
      id: doc.id,
      topic: doc.topic,
      body: doc.body,
      status: doc.status,
      reply: doc.reply ?? "",
      device: doc.device ?? "",
      staffNote: doc.staffNote ?? "",
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      resolvedAt: doc.resolvedAt?.toISOString() ?? null,
      handledByName: handler ? handler.name || handler.username || "Staff" : null,
      user: {
        id: doc.userId,
        name: user?.name || user?.username || "Former member",
        username: user?.username ?? "",
        roleLabel: user ? primaryRoleLabel(parseRoles(user.role)) : "",
        email: user?.email ?? "",
      },
    };
  });
  return { tickets, total, page, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}
