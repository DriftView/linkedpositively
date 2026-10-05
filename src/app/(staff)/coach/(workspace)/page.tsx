import Link from "next/link";
import { ArrowRight, HeartHandshake, MessageCircle, MousePointerClick } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Kbd } from "@/components/ui/kbd";
import { EmptyState, ProgressRing } from "@/features/peer-nav/components/bits";
import { getCurriculumSession } from "@/features/peer-nav/curriculum";
import { listParticipants } from "@/features/peer-nav/queries";
import { shortAgo } from "@/lib/dates";
import { can, requirePermission } from "@/server/auth/session";

export const metadata = { title: "Coach dashboard" };

function greeting(timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function CoachDashboardPage() {
  const viewer = await requirePermission("peernav.coach");
  const participants = await listParticipants(viewer);
  const all = can(viewer, "peernav.allParticipants");
  const inProgress = participants
    .filter((p) => p.currentSerial)
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
    .slice(0, 6);
  const unread = participants.filter((p) => p.unread > 0);
  const completed = participants.reduce((sum, p) => sum + p.completed, 0);
  const finished = participants.filter((p) => p.completed === p.total).length;
  const firstName = viewer.name.split(" ")[0];

  return (
    <div className="animate-rise space-y-6">
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">
          {greeting(viewer.timezone)}, {firstName}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Your coaching workspace</h1>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: all ? "Participants" : "Your participants", value: participants.length },
            { label: "Sessions completed", value: completed },
            { label: "Finished all 6", value: finished },
            { label: "Unread conversations", value: unread.length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-muted/60 px-4 py-3">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-0.5 font-heading text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {participants.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title="No participants assigned yet"
          description="Once a coordinator pairs you with participants, you'll see their sessions, notes and messages here."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="text-base font-semibold">Pick up where you left off</h2>
            <p className="text-sm text-muted-foreground">Sessions that are started but not complete.</p>
            {inProgress.length ? (
              <ul className="mt-4 divide-y">
                {inProgress.map((p) => {
                  const session = getCurriculumSession(p.currentSerial!);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/coach/${p.id}/sessions/${p.currentSerial}`}
                        className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <UserAvatar userId={p.id} name={p.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Session {p.currentSerial}: {session?.title}
                          </span>
                        </span>
                        {p.lastActivityAt ? <span className="shrink-0 text-xs text-muted-foreground">{shortAgo(p.lastActivityAt, viewer.timezone)}</span> : null}
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">Nothing in progress right now.</p>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="text-base font-semibold">Waiting for a reply</h2>
            <p className="text-sm text-muted-foreground">Participants with unread messages.</p>
            {unread.length ? (
              <ul className="mt-4 divide-y">
                {unread.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/coach/${p.id}/messages`}
                      className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <UserAvatar userId={p.id} name={p.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-magenta/10 px-2 py-0.5 text-xs font-semibold text-brand-magenta">
                        <MessageCircle aria-hidden className="size-3.5" />
                        {p.unread} new
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft xl:col-span-2">
            <h2 className="text-base font-semibold">Progress at a glance</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {participants.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/coach/${p.id}/sessions`}
                    className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ProgressRing value={p.completed} total={p.total} size={34}>
                      <span className="text-[0.65rem] font-semibold tabular-nums">
                        {p.completed}/{p.total}
                      </span>
                    </ProgressRing>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground max-lg:hidden">
        <MousePointerClick aria-hidden className="size-3.5" />
        Choose a participant to open their workspace. Press <Kbd>/</Kbd> to search.
      </p>
    </div>
  );
}
