import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireParticipantAccess } from "@/features/peer-nav/access";
import { CheckinCalendar } from "@/features/tracker/components/checkin-calendar";
import { getCheckinCalendar } from "@/features/tracker/queries";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { users } from "@/server/db/schema";

export const metadata = { title: "Tracker" };

/**
 * The participant's Link Positively daily check-in calendar (meds + mood),
 * read directly by user id (legacy: cross-database lookup by username).
 */
export default async function ParticipantTrackerPage({ params }: PageProps<"/coach/[participantId]/tracker">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId } = await params;
  await requireParticipantAccess(viewer, participantId);
  if (!isUuid(participantId)) notFound();
  const [user] = await db
    .select({ name: users.name, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, participantId))
    .limit(1);
  if (!user) notFound();
  const timezone = user.timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  const from = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const days = await getCheckinCalendar(participantId, { from, to: now, timezone });
  const firstName = user.name.split(" ")[0] || "This participant";

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="text-base font-semibold">Daily check-ins</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {firstName}&apos;s medication and mood check-ins from Link Positively, shown in their time zone (
        {timezone.replace(/_/g, " ")}).
      </p>
      <CheckinCalendar days={days} today={dayKey(now, timezone)} subjectName={firstName} />
    </section>
  );
}
