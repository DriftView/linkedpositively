import { ParticipantMessages } from "@/features/peer-nav/message-pages";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Messages" };

export default async function CoachingThreadPage({ params }: PageProps<"/coaching/messages/[threadId]">) {
  const viewer = await requirePermission("peernav.messages");
  const { threadId } = await params;
  return <ParticipantMessages viewer={viewer} threadId={threadId} composing={false} />;
}
