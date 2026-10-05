import Link from "next/link";
import { ArrowRight, Flag, Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { GoalCard } from "@/features/journey/components/goal-card";
import { StartGoal } from "@/features/journey/components/start-goal";
import { ACCENTS } from "@/features/journey/lib";
import { listCategories, listMyGoals } from "@/features/journey/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "My journey" };

export default async function JourneyPage() {
  const viewer = await requirePermission("tracker.use");
  const [goals, categories] = await Promise.all([listMyGoals(viewer.id), listCategories()]);
  const active = goals.filter((goal) => goal.step < 7);
  const completed = goals.filter((goal) => goal.step === 7);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="My journey"
        description="Choose goals that matter to you and move through them one step at a time."
        count={active.length || undefined}
        countLabel="in progress"
      />

      <section aria-labelledby="my-goals">
        <h2 id="my-goals" className="sr-only">
          My goals
        </h2>
        {active.length ? (
          <div className="grid gap-3">
            {active.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-secondary via-card to-card p-6 shadow-soft sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-card text-primary shadow-soft">
              <Flag aria-hidden className="size-6" />
            </span>
            <h3 className="mt-4 text-xl font-semibold">Start your first goal</h3>
            <p className="mt-1 max-w-md text-muted-foreground">
              Pick an area of life below for ideas, or write a goal in your own words. Small steps count.
            </p>
            <div className="mt-5">
              <StartGoal kind="own" categories={categories.map((category) => category.name)} />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="explore" className="mt-10">
        <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="explore" className="text-xl font-semibold">
              Find a goal
            </h2>
            <p className="text-sm text-muted-foreground">Ideas to get you started, grouped by area of life.</p>
          </div>
          {active.length ? <StartGoal kind="own" categories={categories.map((category) => category.name)} /> : null}
        </div>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {categories.map((category, index) => {
            const accent = ACCENTS[category.accent];
            return (
              <li key={category.id} className="animate-rise" style={{ animationDelay: `${index * 40}ms` }}>
                <Link
                  href={`/journey/${category.slug}`}
                  className={cn(
                    "group flex h-full flex-col rounded-2xl border bg-gradient-to-br to-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift",
                    accent.soft,
                  )}
                >
                  <span className="font-heading text-[1.05rem] leading-snug font-semibold">{category.name}</span>
                  <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{category.description}</span>
                  <span className="mt-auto flex items-center justify-between pt-3 text-xs font-semibold text-muted-foreground">
                    {category.goalCount} ideas
                    <ArrowRight aria-hidden className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {completed.length ? (
        <section aria-labelledby="completed" className="mt-10">
          <h2 id="completed" className="mb-3 flex items-center gap-2 px-1 text-xl font-semibold">
            <Trophy aria-hidden className="size-5 text-brand-apricot" />
            Completed
            <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-semibold text-muted-foreground tabular-nums">{completed.length}</span>
          </h2>
          <div className="grid gap-3">
            {completed.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
