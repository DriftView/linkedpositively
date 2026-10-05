import Link from "next/link";
import { LifeBuoy, Mail, Video } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/features/peer-nav/components/bits";
import { CoachingPlan } from "@/features/peer-nav/components/coaching-plan";
import { getMyCoach, getSessionPlan } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "Coaching plans" };

const CONTACT_EMAIL = "ecoach.techstep@prideresearch.org";

/** Participant "Coaching Plans" (legacy /user-dashboard). */
export default async function CoachingPlansPage() {
  const viewer = await requirePermission("peernav.participant");
  const [{ plan }, coach] = await Promise.all([getSessionPlan(viewer.id), getMyCoach(viewer.id)]);
  void trackUsage(viewer.id, "peernav_view", { page: "plans" });
  const completed = plan.filter((s) => s.status === "complete").length;

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Coaching plans" description="Your six sessions with your peer navigator, in the order you'll do them." />

      <section className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft">
        <ProgressRing value={completed} total={plan.length} size={56} stroke={5}>
          <span className="text-sm font-semibold tabular-nums">
            {completed}/{plan.length}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {completed === plan.length ? "You've completed every session. Well done!" : completed ? `${completed} of ${plan.length} sessions complete` : "Your coaching journey starts here"}
          </p>
          <p className="text-sm text-muted-foreground">
            {coach ? (
              <>
                With <Link href="/coaching/coach" className="font-medium text-foreground underline-offset-4 hover:underline">{coach.name}</Link>, your peer navigator.
              </>
            ) : (
              "You'll be matched with a peer navigator soon."
            )}
          </p>
        </div>
        {coach?.zoomLink ? (
          <Button asChild size="lg" className="rounded-full max-sm:hidden">
            <a href={coach.zoomLink} target="_blank" rel="noopener noreferrer">
              <Video aria-hidden />
              Launch Zoom
            </a>
          </Button>
        ) : null}
      </section>
      {coach?.zoomLink ? (
        <Button asChild size="lg" className="h-11 w-full rounded-full sm:hidden">
          <a href={coach.zoomLink} target="_blank" rel="noopener noreferrer">
            <Video aria-hidden />
            Launch Zoom
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      ) : null}

      <div className="space-y-3 rounded-2xl bg-secondary/70 p-4 text-sm leading-relaxed text-secondary-foreground sm:p-5">
        <p className="flex gap-3">
          <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Need to contact your eCoach to reschedule a session? We can be reached at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </span>
        </p>
        <p className="flex gap-3">
          <LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            eCoaching is not meant to be a replacement for psychiatric or psychological services. If you are experiencing a psychiatric or medical emergency, please call{" "}
            <a href="tel:911" className="font-semibold underline underline-offset-4">
              911
            </a>{" "}
            or go to the nearest emergency room.
          </span>
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm text-muted-foreground">Click the title of each module below to collapse or expand its contents.</p>
        <CoachingPlan sessions={plan} />
      </div>
    </div>
  );
}
