import { PageHeader } from "@/components/app/page-header";
import { CoachInbox } from "@/features/peer-nav/message-pages";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Messages" };

/** Coach inbox: every conversation with the viewer's participants. */
export default async function CoachMessagesPage({ searchParams }: PageProps<"/coach/messages">) {
  const viewer = await requirePermission("peernav.messages");
  const query = await searchParams;
  return (
    <div className="animate-rise">
      <PageHeader title="Messages" description="Private conversations with your participants." />
      <CoachInbox viewer={viewer} composing={query.new === "1"} />
    </div>
  );
}
