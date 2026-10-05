import "server-only";
import { notFound } from "next/navigation";
import type { Viewer } from "@/server/auth/session";
import { MessagesView, type ComposeOptions, type MessagesRouting } from "./components/messages-view";
import { getThread, listThreads } from "./messages";
import { getMyCoach, listParticipants } from "./queries";

/** Server wrappers that load data for the three messages screens. */

export async function ParticipantMessages({ viewer, threadId, composing }: { viewer: Viewer; threadId?: string; composing: boolean }) {
  const [threads, active, coach] = await Promise.all([
    listThreads(viewer.id),
    threadId ? getThread(viewer.id, threadId) : Promise.resolve(null),
    getMyCoach(viewer.id),
  ]);
  if (threadId && !active) notFound();
  const compose: ComposeOptions = coach
    ? { kind: "fixed", recipient: coach, recipientNote: "your peer navigator" }
    : { kind: "disabled", reason: "You'll be able to message your peer navigator once you're matched with one." };
  return <MessagesView threads={threads} active={active} composing={composing} compose={compose} routing={{ base: "/coaching/messages", mode: "path" }} timezone={viewer.timezone} twoPane={false} />;
}

export async function CoachInbox({ viewer, threadId, composing }: { viewer: Viewer; threadId?: string; composing: boolean }) {
  const [threads, active, participants] = await Promise.all([
    listThreads(viewer.id),
    threadId ? getThread(viewer.id, threadId) : Promise.resolve(null),
    listParticipants(viewer),
  ]);
  if (threadId && !active) notFound();
  const mine = participants.filter((p) => p.coach?.id === viewer.id);
  const compose: ComposeOptions = mine.length
    ? { kind: "choose", recipients: mine.map(({ id, name, username }) => ({ id, name, username })) }
    : { kind: "disabled", reason: "When participants are assigned to you, you can message them here." };
  return <MessagesView threads={threads} active={active} composing={composing} compose={compose} routing={{ base: "/coach/messages", mode: "path" }} timezone={viewer.timezone} twoPane />;
}

export async function ParticipantTabMessages({
  viewer,
  participant,
  isAssignedCoach,
  threadId,
  composing,
}: {
  viewer: Viewer;
  participant: { id: string; name: string; username: string };
  isAssignedCoach: boolean;
  threadId?: string;
  composing: boolean;
}) {
  const [threads, active] = await Promise.all([
    listThreads(viewer.id, { participantId: participant.id }),
    threadId ? getThread(viewer.id, threadId) : Promise.resolve(null),
  ]);
  const routing: MessagesRouting = { base: `/coach/${participant.id}/messages`, mode: "query" };
  const compose: ComposeOptions = isAssignedCoach
    ? { kind: "fixed", recipient: participant, participantId: participant.id }
    : { kind: "disabled", reason: `Only ${participant.name}'s peer navigator can message them.` };
  const valid = active && active.participantId === participant.id ? active : null;
  return <MessagesView threads={threads} active={valid} composing={composing} compose={compose} routing={routing} timezone={viewer.timezone} twoPane />;
}
