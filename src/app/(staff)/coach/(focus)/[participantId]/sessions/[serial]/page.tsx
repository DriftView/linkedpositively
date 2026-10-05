import { notFound } from "next/navigation";
import { requireParticipantAccess } from "@/features/peer-nav/access";
import { SessionRunner } from "@/features/peer-nav/components/session-runner";
import { getCurriculumSession } from "@/features/peer-nav/curriculum";
import { getRunnerData } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata({ params }: PageProps<"/coach/[participantId]/sessions/[serial]">) {
  const { serial } = await params;
  const session = getCurriculumSession(Number(serial));
  return { title: session ? `Session ${session.serial}: ${session.title}` : "Session" };
}

/** Session runner (legacy /load-session/{serial}-{uid}). */
export default async function SessionRunnerPage({ params }: PageProps<"/coach/[participantId]/sessions/[serial]">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId, serial } = await params;
  await requireParticipantAccess(viewer, participantId);
  const n = Number(serial);
  if (!Number.isInteger(n)) notFound();
  const data = await getRunnerData(viewer, participantId, n);
  if (!data) notFound();
  // Remount when switching sessions so form state starts fresh.
  return <SessionRunner key={`${participantId}:${n}`} data={data} timezone={viewer.timezone} />;
}
