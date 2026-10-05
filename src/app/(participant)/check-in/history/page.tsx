import Link from "next/link";
import { ArrowLeft, ChevronRight, History } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { weekRange } from "@/features/checkin/format";
import { CheckinEmpty } from "@/features/checkin/components/checkin-empty";
import { checkinHistory } from "@/features/checkin/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Past check-ins" };

const STATUS = {
  answered: { label: "Checked in", className: "bg-success/15 text-success" },
  open: { label: "Open now", className: "bg-brand-magenta/10 text-brand-magenta dark:bg-brand-magenta/20" },
  missed: { label: "Missed", className: "bg-muted text-muted-foreground" },
} as const;

/** Your weekly check-ins (the old /weekly-feedback week picker). */
export default async function CheckinHistoryPage() {
  const viewer = await requirePermission("checkin.weekly");
  const items = await checkinHistory(viewer);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/check-in"
        className="mb-4 -ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Weekly check-in
      </Link>
      <PageHeader title="Past check-ins" description="Look back at your weeks, what you wrote and the feedback you got." />

      {items.length ? (
        <ul className="space-y-3">
          {items.map((item) => {
            const status = STATUS[item.status];
            return (
              <li key={item.week} className="animate-rise">
                <Link
                  href={item.status === "open" ? "/check-in" : `/check-in/week/${item.week}`}
                  className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <span className="text-[0.65rem] leading-none font-semibold tracking-wide uppercase">Week</span>
                    <span className="font-heading text-lg leading-tight font-semibold tabular-nums">{item.week}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{weekRange(item.start, item.end)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", status.className)}>{status.label}</span>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {item.medsAnswered ? `Meds on ${item.medsTaken} of 7 days` : "No daily check-ins logged"}
                      {item.likertLabel ? ` · “${item.likertLabel}”` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <CheckinEmpty
          icon={History}
          title="No check-ins yet"
          description="After your first week, your check-ins will collect here."
          action={{ href: "/check-in", label: "Go to this week's check-in" }}
        />
      )}
    </div>
  );
}
