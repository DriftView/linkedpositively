import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { tipSchedule } from "@/features/tips/admin-queries";
import { AdminTipsNav } from "@/features/tips/components/admin/admin-tips-nav";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Tip schedule" };

type Day = { day: number; tips: { id: string; title: string; published: boolean }[] };

function Grid({ days, label }: { days: Day[]; label: string }) {
  const empty = days.filter((d) => !d.tips.some((t) => t.published)).length;
  return (
    <section aria-label={label} className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{label}</h2>
        <p className="text-sm text-muted-foreground">
          {empty ? `${empty} ${empty === 1 ? "day has" : "days have"} no published tip` : "Every day has a tip"}
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
        {days.map((d) => {
          const none = !d.tips.some((t) => t.published);
          return (
            <li
              key={d.day}
              className={cn("min-h-20 rounded-lg border bg-card p-2.5", none && "border-dashed bg-muted/40")}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold tabular-nums">Day {d.day}</span>
                {d.tips.length ? <span className="text-muted-foreground tabular-nums">{d.tips.length}</span> : null}
              </div>
              {d.tips.length ? (
                <ul className="mt-1.5 space-y-1">
                  {d.tips.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/admin/content/tips/${t.id}`}
                        className={cn("line-clamp-2 text-xs leading-snug hover:text-primary hover:underline", !t.published && "text-muted-foreground line-through")}
                        title={t.published ? t.title : `${t.title} (hidden)`}
                      >
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">No tip</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Both 90-day cycles at a glance (the old thrive-tips-all-view-for-admin). */
export default async function TipSchedulePage({ searchParams }: PageProps<"/admin/content/tips/schedule">) {
  await requirePermission("content.manage");
  const { cycle } = await searchParams;
  const schedule = await tipSchedule();
  const two = cycle === "2";
  return (
    <div>
      <PageHeader title="Thrive Tips" description="Which tips participants receive on each day of their study." />
      <AdminTipsNav />
      <div className="inline-flex rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Cycle">
        {[
          ["1", "Cycle 1 · days 1–90"],
          ["2", "Cycle 2 · days 91–180+"],
        ].map(([value, label]) => {
          const active = (value === "2") === two;
          return (
            <Link
              key={value}
              role="tab"
              aria-selected={active}
              href={value === "2" ? "?cycle=2" : "?"}
              className={cn("rounded-md px-3 py-1.5 font-medium transition", active ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <Grid days={two ? schedule.cycleTwo : schedule.cycleOne} label={two ? "Cycle 2 (repeats every 90 days)" : "Cycle 1"} />
      {schedule.unscheduled.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Not scheduled</h2>
          <p className="text-sm text-muted-foreground">These tips have no cycle 1 day, so participants never receive them.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {schedule.unscheduled.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/content/tips/${t.id}`} className="inline-flex rounded-md border bg-card px-2.5 py-1 text-sm hover:border-primary/50">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
