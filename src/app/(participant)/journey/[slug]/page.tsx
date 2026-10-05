import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StartGoal } from "@/features/journey/components/start-goal";
import { ACCENTS } from "@/features/journey/lib";
import { getCategoryWithGoals, listCategories, myActiveGoalIds } from "@/features/journey/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata(props: PageProps<"/journey/[slug]">) {
  await requirePermission("tracker.use");
  const { slug } = await props.params;
  const data = await getCategoryWithGoals(slug);
  return { title: data ? `${data.category.name} · My journey` : "My journey" };
}

export default async function JourneyCategoryPage(props: PageProps<"/journey/[slug]">) {
  const viewer = await requirePermission("tracker.use");
  const { slug } = await props.params;
  const [data, activeIds, categories] = await Promise.all([getCategoryWithGoals(slug), myActiveGoalIds(viewer.id), listCategories()]);
  if (!data) notFound();
  const accent = ACCENTS[data.category.accent];
  const active = new Set(activeIds);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/journey" className="mb-4 inline-flex h-10 items-center gap-1.5 pr-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        My journey
      </Link>

      <header className={cn("animate-rise rounded-3xl border bg-gradient-to-br to-card p-6 shadow-soft sm:p-8", accent.soft)}>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Area of life</p>
        <h1 className="mt-1 text-3xl font-semibold">{data.category.name}</h1>
        {data.category.description ? <p className="mt-2 text-muted-foreground">{data.category.description}</p> : null}
      </header>

      <div className="mt-6 grid gap-5">
        {data.methods.map((method, index) => (
          <section
            key={method.id}
            aria-labelledby={`method-${method.id}`}
            className="animate-rise rounded-2xl border bg-card shadow-soft"
            style={{ animationDelay: `${(index + 1) * 40}ms` }}
          >
            <h2 id={`method-${method.id}`} className="px-4 pt-4 text-[1.05rem] leading-snug font-semibold sm:px-5">
              <span className="font-sans text-sm font-medium text-muted-foreground">I want to </span>
              {method.name.charAt(0).toLowerCase() + method.name.slice(1)}
            </h2>
            {method.goals.length ? (
              <ul className="mt-2 divide-y">
                {method.goals.map((goal) => (
                  <li key={goal.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", accent.bar)} />
                    <span className="min-w-0 flex-1 text-[0.95rem]">{goal.name}</span>
                    <StartGoal kind="catalog" goalId={goal.id} goalName={goal.name} active={active.has(goal.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">No goal ideas here yet.</p>
            )}
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-muted/30 p-6 text-center">
        <p className="font-heading font-semibold">Don&apos;t see what you want?</p>
        <StartGoal kind="own" categories={categories.map((category) => category.name)} />
      </div>
    </div>
  );
}
