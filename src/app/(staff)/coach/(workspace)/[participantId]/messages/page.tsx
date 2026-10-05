import { notFound } from "next/navigation";
import { requireParticipantAccess } from "@/features/peer-nav/access";
import { ParticipantTabMessages } from "@/features/peer-nav/message-pages";
import { getParticipantHeader } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Messages" };

export default async function ParticipantMessagesTab({ params, searchParams }: PageProps<"/coach/[participantId]/messages">) {
  const viewer = await requirePermission("peernav.messages");
  const { participantId } = await params;
  const query = await searchParams;
  const access = await requireParticipantAccess(viewer, participantId);
  const participant = await getParticipantHeader(participantId);
  if (!participant) notFound();
  return (
    <ParticipantTabMessages
      viewer={viewer}
      participant={participant}
      isAssignedCoach={access.isAssignedCoach}
      threadId={typeof query.thread === "string" ? query.thread : undefined}
      composing={query.new === "1"}
    />
  );
}
