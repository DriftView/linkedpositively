import { PageHeader } from "@/components/app/page-header";
import { ParticipantMessages } from "@/features/peer-nav/message-pages";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Messages" };

/** Participant messages with their peer navigator (legacy /user-messages). */
export default async function CoachingMessagesPage({ searchParams }: PageProps<"/coaching/messages">) {
  const viewer = await requirePermission("peernav.messages");
  const query = await searchParams;
  const composing = query.new === "1";
  return (
    <div className="animate-rise">
      {composing ? null : <PageHeader title="Messages" description="Private messages between you and your peer navigator." />}
      <ParticipantMessages viewer={viewer} composing={composing} />
    </div>
  );
}
