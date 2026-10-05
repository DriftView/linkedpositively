import { PageHeader } from "@/components/app/page-header";
import { FileManager } from "@/features/peer-nav/components/file-manager";
import { listFiles } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "My files" };

/** Participant file sharing with their peer navigator (legacy /user-files). */
export default async function MyFilesPage() {
  const viewer = await requirePermission("peernav.participant");
  const files = await listFiles(viewer, viewer.id);
  return (
    <div className="animate-rise">
      <PageHeader
        title="My files"
        description="To share a completed activity with your peer navigator, add it here. You'll also find anything they share with you."
      />
      <FileManager participantId={viewer.id} files={files} timezone={viewer.timezone} viewerIsParticipant />
    </div>
  );
}
