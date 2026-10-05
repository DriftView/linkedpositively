import { requireParticipantAccess } from "@/features/peer-nav/access";
import { NotesPanel } from "@/features/peer-nav/components/notes-panel";
import { listNotes } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Notes" };

export default async function ParticipantNotesPage({ params }: PageProps<"/coach/[participantId]/notes">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId } = await params;
  await requireParticipantAccess(viewer, participantId);
  const notes = await listNotes(viewer, participantId);
  return <NotesPanel participantId={participantId} notes={notes} timezone={viewer.timezone} />;
}
