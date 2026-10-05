import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireParticipantAccess } from "@/features/peer-nav/access";
import { DetailRow, StatusPill } from "@/features/peer-nav/components/bits";
import { EditParticipantDialog } from "@/features/peer-nav/components/edit-participant-dialog";
import { compactDuration } from "@/features/peer-nav/format";
import { getParticipantDetail, getSessionPlan } from "@/features/peer-nav/queries";
import { formatInZone, friendlyDate } from "@/lib/dates";
import { can, requirePermission } from "@/server/auth/session";

export const metadata = { title: "Participant details" };

export default async function ParticipantDetailsPage({ params }: PageProps<"/coach/[participantId]">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId } = await params;
  const access = await requireParticipantAccess(viewer, participantId);
  const [detail, { plan }] = await Promise.all([getParticipantDetail(access), getSessionPlan(participantId)]);
  if (!detail) notFound();
  const tz = viewer.timezone;
  const next = plan.find((s) => s.status !== "complete");

  return (
    <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="@container rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Details</h2>
          {can(viewer, "peernav.editParticipant") ? (
            <EditParticipantDialog
              participant={detail}
              trigger={
                <Button variant="ghost" size="sm">
                  <Pencil aria-hidden />
                  Edit
                </Button>
              }
            />
          ) : null}
        </div>
        <dl className="mt-2 divide-y">
          <DetailRow label="Name">{detail.name}</DetailRow>
          <DetailRow label="Username">@{detail.username}</DetailRow>
          <DetailRow label="Age">{detail.age ?? null}</DetailRow>
          <DetailRow label="Pronouns">{detail.pronouns}</DetailRow>
          <DetailRow label="Location">{detail.location}</DetailRow>
          <DetailRow label="On PrEP">{detail.onPrep === null ? null : detail.onPrep ? "Yes" : "No"}</DetailRow>
          <DetailRow label="Study ID">{detail.studyId ? <span className="font-mono text-[0.85rem]">{detail.studyId}</span> : null}</DetailRow>
          <DetailRow label="Participant code">
            {detail.participantCode ? <span className="font-mono text-[0.85rem]">{detail.participantCode}</span> : null}
          </DetailRow>
          <DetailRow label="Email">{detail.email ? <span className="break-all">{detail.email}</span> : null}</DetailRow>
        </dl>
      </section>

      <div className="grid gap-6 @2xl:max-@4xl:grid-cols-2 @4xl:content-start">
        <section className="@container rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="text-base font-semibold">Time on site</h2>
          <p className="mt-2 font-heading text-3xl font-semibold tabular-nums">{compactDuration(detail.timeOnSiteSeconds)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Across {detail.signIns} {detail.signIns === 1 ? "sign-in" : "sign-ins"}
            {detail.lastSignInAt ? `, last ${friendlyDate(detail.lastSignInAt, tz)}` : ""}. Sessions without a sign-out aren&apos;t counted.
          </p>
          <dl className="mt-4 divide-y border-t">
            <DetailRow label="Coach">{detail.coach?.name}</DetailRow>
            <DetailRow label="Account created">{detail.createdAt ? formatInZone(detail.createdAt, "MMM d, yyyy", tz) : null}</DetailRow>
          </dl>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Coaching plan</h2>
            <Link href={`/coach/${participantId}/sessions`} className="rounded text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              Open
            </Link>
          </div>
          <ol className="mt-3 space-y-2">
            {plan.map((s, index) => (
              <li key={s.serial} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <StatusPill status={s.status} className="h-5 px-1.5 text-[0.7rem]" />
              </li>
            ))}
          </ol>
          {next ? (
            <Button asChild className="mt-4 w-full" size="lg">
              <Link href={`/coach/${participantId}/sessions/${next.serial}`}>
                {next.status === "in_progress" ? "Resume" : "Next up"}: session {next.serial}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
