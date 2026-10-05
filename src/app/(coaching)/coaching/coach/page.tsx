import Link from "next/link";
import { MapPin, MessageCircle, Sparkles, Video } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/peer-nav/components/bits";
import { getMyCoach } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "My coach" };

/** "My Coach's Profile" (legacy /coach-details). */
export default async function MyCoachPage() {
  const viewer = await requirePermission("peernav.participant");
  const coach = await getMyCoach(viewer.id);

  if (!coach) {
    return (
      <div className="animate-rise">
        <PageHeader title="My coach" />
        <EmptyState
          icon={Sparkles}
          title="No coach assigned yet"
          description="The study team will match you with a peer navigator soon. You'll see their profile, Zoom link and messages here."
        />
      </div>
    );
  }

  const facts = [
    { label: "First name", value: coach.firstName },
    { label: "Pronouns", value: coach.pronouns },
  ].filter((f) => f.value);

  return (
    <div className="animate-rise">
      <PageHeader title="My coach" description="Your peer navigator for the program." />
      <article className="overflow-hidden rounded-3xl border bg-card shadow-soft">
        <div className="relative h-24 bg-gradient-to-br from-brand-plum/25 via-brand-pink/25 to-brand-apricot/30 sm:h-28" aria-hidden />
        <div className="-mt-12 px-5 pb-6 sm:px-6">
          <UserAvatar userId={coach.id} name={coach.name} size="xl" version={coach.avatarVersion ?? undefined} className="ring-4 ring-card" />
          <h2 className="mt-3 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold">
            {coach.name}
            {coach.pronouns ? <span className="font-sans text-sm font-normal text-muted-foreground">{coach.pronouns}</span> : null}
          </h2>
          {coach.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden className="size-4" />
              {coach.location}
            </p>
          ) : null}

          {facts.length ? (
            <dl className="mt-5 grid grid-cols-2 gap-2">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-xl bg-muted/60 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {coach.aboutMe ? (
            <section className="mt-5">
              <h3 className="font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">About me</h3>
              <p className="mt-1.5 text-[0.95rem] leading-relaxed whitespace-pre-line">{coach.aboutMe}</p>
            </section>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {coach.zoomLink ? (
              <Button asChild size="lg" className="h-11 rounded-full px-5">
                <a href={coach.zoomLink} target="_blank" rel="noopener noreferrer">
                  <Video aria-hidden />
                  Launch Zoom
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
            <Button asChild size="lg" variant="secondary" className="h-11 rounded-full px-5">
              <Link href="/coaching/messages?new=1">
                <MessageCircle aria-hidden />
                Send a message
              </Link>
            </Button>
          </div>
          {coach.zoomLink ? (
            <p className="mt-3 text-xs break-all text-muted-foreground">
              Zoom link:{" "}
              <a href={coach.zoomLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
                {coach.zoomLink}
              </a>
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
