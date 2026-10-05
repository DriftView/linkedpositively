import { PageHeader } from "@/components/app/page-header";
import { CoachInbox } from "@/features/peer-nav/message-pages";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Messages" };

export default async function CoachThreadPage({ params }: PageProps<"/coach/messages/[threadId]">) {
  const viewer = await requirePermission("peernav.messages");
  const { threadId } = await params;
  return (
    <div>
      <PageHeader title="Messages" description="Private conversations with your participants." className="max-md:hidden" />
      <CoachInbox viewer={viewer} threadId={threadId} composing={false} />
    </div>
  );
}
