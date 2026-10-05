import "server-only";
import { and, count, desc, eq, lte, max } from "drizzle-orm";
import { db } from "@/server/db/client";
import { pnCoachAssignments, pnSessions, profiles, users } from "@/server/db/schema";
import { PN_PARTICIPANT_ROLE, roleFilter } from "./access";
import { CURRICULUM } from "./curriculum";
import { iso, peopleById, personColumns, toPerson } from "./people";
import type { PersonRef } from "./types";

export type AssignmentRow = PersonRef & {
  coach: PersonRef | null;
  assignedAt: string | null;
  completed: number;
  blocked: boolean;
};

export type AssignmentEvent = {
  id: string;
  participant: PersonRef | null;
  coach: PersonRef | null;
  previousCoach: PersonRef | null;
  assignedBy: PersonRef | null;
  createdAt: string;
};

/** Every Peer Navigation participant with their current coach. */
export async function listAssignments(): Promise<AssignmentRow[]> {
  const lastEvents = db
    .select({ participantId: pnCoachAssignments.participantId, at: max(pnCoachAssignments.createdAt).as("at") })
    .from(pnCoachAssignments)
    .groupBy(pnCoachAssignments.participantId)
    .as("last_events");
  const completed = db
    .select({ participantId: pnSessions.participantId, n: count().as("n") })
    .from(pnSessions)
    .where(and(eq(pnSessions.status, "complete"), lte(pnSessions.serial, CURRICULUM.length)))
    .groupBy(pnSessions.participantId)
    .as("completed");
  const rows = await db
    .select({
      ...personColumns,
      banned: users.banned,
      coachId: profiles.coachId,
      at: lastEvents.at,
      completed: completed.n,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(lastEvents, eq(lastEvents.participantId, users.id))
    .leftJoin(completed, eq(completed.participantId, users.id))
    .where(roleFilter(PN_PARTICIPANT_ROLE));
  const people = await peopleById(rows.map((row) => row.coachId));
  return rows
    .map((row) => ({
      ...toPerson(row),
      coach: row.coachId ? (people.get(row.coachId) ?? null) : null,
      assignedAt: iso(row.at),
      completed: row.completed ?? 0,
      blocked: Boolean(row.banned),
    }))
    .sort((a, b) => Number(Boolean(a.coach)) - Number(Boolean(b.coach)) || a.name.localeCompare(b.name));
}

export async function assignmentHistory(limit = 30): Promise<AssignmentEvent[]> {
  const events = await db
    .select()
    .from(pnCoachAssignments)
    .orderBy(desc(pnCoachAssignments.createdAt), desc(pnCoachAssignments.id))
    .limit(limit);
  const people = await peopleById(events.flatMap((e) => [e.participantId, e.coachId, e.previousCoachId, e.assignedBy]));
  const get = (id: string | null) => (id ? (people.get(id) ?? null) : null);
  return events.map((e) => ({
    id: e.id,
    participant: get(e.participantId),
    coach: get(e.coachId),
    previousCoach: get(e.previousCoachId),
    assignedBy: get(e.assignedBy),
    createdAt: e.createdAt.toISOString(),
  }));
}
