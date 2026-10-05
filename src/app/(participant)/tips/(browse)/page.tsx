import Link from "next/link";
import { after } from "next/server";
import { ArrowRight, CalendarClock, Eye, Sprout } from "lucide-react";
import { TipCard } from "@/features/tips/components/tip-card";
import { TipCarousel } from "@/features/tips/components/tip-carousel";
import { TipsEmpty } from "@/features/tips/components/tips-empty";
import { markTipsSeen, tipsHome } from "@/features/tips/queries";
import { can, requirePermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "Your tips" };

export default async function TipsTodayPage() {
  const viewer = await requirePermission("tips.view");
  const home = await tipsHome(viewer);

  if (can(viewer, "tips.earnPoints")) {
    after(async () => {
      await markTipsSeen(viewer);
      await trackUsage(viewer.id, "tips_view");
    });
  }

  if (home.notStarted) {
    return (
      <TipsEmpty
        icon={CalendarClock}
        title="Your tips start with your study"
        description="Once your study start date is set, a new tip will be waiting for you here every day."
      />
    );
  }

  const carousel = home.featured;
  const shown = new Set([...carousel, ...home.earlier].map((t) => t.id));
  const picked = home.recommended.filter((t) => !shown.has(t.id)).slice(0, 3);
  const heading = home.featuredIsToday || home.preview ? "Today’s tips" : "Your latest tips";

  return (
    <div className="space-y-10">
      {home.preview ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
          You&apos;re previewing published tips. Participants see tips as they are released during their study.
        </p>
      ) : null}

      <section aria-labelledby="today-heading" className="animate-rise">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 id="today-heading" className="text-xl font-semibold">
            {heading}
          </h2>
          {home.clock ? <span className="text-sm text-muted-foreground">Day {home.clock.day} of your journey</span> : null}
        </div>
        {!home.featuredIsToday && carousel.length && !home.preview ? (
          <p className="mb-2 text-sm text-muted-foreground">No new tips today — here are your most recent ones.</p>
        ) : null}
        {carousel.length ? (
          <TipCarousel tips={carousel} label={heading} />
        ) : (
          <div className="mt-3">
            <TipsEmpty
              icon={Sprout}
              title="Your first tip is on its way"
              description="New tips arrive as your study goes on. Check back tomorrow."
            />
          </div>
        )}
      </section>

      {home.earlier.length ? (
        <section aria-labelledby="earlier-heading" className="animate-rise">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="earlier-heading" className="text-xl font-semibold">
              Earlier this week
            </h2>
            <Link href="/tips/explore" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              All tips <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <ul className="space-y-3">
            {home.earlier.slice(0, 6).map((tip) => (
              <li key={tip.id}>
                <TipCard tip={tip} variant="compact" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {picked.length ? (
        <section aria-labelledby="picked-heading" className="animate-rise">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="picked-heading" className="text-xl font-semibold">
              Picked for you
            </h2>
            <Link href="/tips/explore?for=you" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              See all <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <ul className="space-y-3">
            {picked.map((tip) => (
              <li key={tip.id}>
                <TipCard tip={tip} variant="compact" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {home.topTags.length ? (
        <section aria-labelledby="topics-heading" className="animate-rise">
          <h2 id="topics-heading" className="mb-3 text-xl font-semibold">
            Browse by topic
          </h2>
          <ul className="flex flex-wrap gap-2">
            {home.topTags.map((tag) => (
              <li key={tag.id}>
                <Link
                  href={`/tips/explore?tags=${encodeURIComponent(tag.slug)}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-soft transition hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {tag.name}
                  <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{tag.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
