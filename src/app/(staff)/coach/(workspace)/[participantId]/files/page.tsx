import { requireParticipantAccess } from "@/features/peer-nav/access";
import { FileManager } from "@/features/peer-nav/components/file-manager";
import { listFiles } from "@/features/peer-nav/queries";
import { can, requirePermission } from "@/server/auth/session";

export const metadata = { title: "Files" };

export default async function ParticipantFilesPage({ params }: PageProps<"/coach/[participantId]/files">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId } = await params;
  await requireParticipantAccess(viewer, participantId);
  const files = await listFiles(viewer, participantId, { canRemoveAny: can(viewer, "peernav.allParticipants") });
  return <FileManager participantId={participantId} files={files} timezone={viewer.timezone} viewerIsParticipant={false} />;
}
