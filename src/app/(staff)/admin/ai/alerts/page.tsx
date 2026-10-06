import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { AlertList } from "@/features/ai-coach/components/admin/alert-list";
import { alertCounts, listAlerts } from "@/features/ai-coach/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import type { AiAlertStatus } from "@/server/db/schema";

export const metadata: Metadata = { title: "AI safety alerts" };

const TABS: { id: AiAlertStatus | "all"; label: string; empty: string }[] = [
  { id: "open", label: "New", empty: "No new alerts. Conversations that need a person show up here right away." },
  { id: "in_review", label: "In review", empty: "Nothing in review." },
  { id: "resolved", label: "Resolved", empty: "No resolved alerts yet." },
  { id: "all", label: "All", empty: "No alerts yet." },
];

export default async function AiAlertsPage(props: PageProps<"/admin/ai/alerts">) {
  const viewer = await requirePermission("ai.review");
  const params = await props.searchParams;
  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const tab = TABS.find((item) => item.id === requested) ?? TABS[0];
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);
  const [counts, list] = await Promise.all([alertCounts(), listAlerts({ status: tab.id, page })]);
  const total = counts.open + counts.in_review + counts.resolved;
  const pageHref = (target: number) =>
    `/admin/ai/alerts?${new URLSearchParams({ ...(tab.id === "open" ? {} : { status: tab.id }), page: String(target) })}`;

  return (
    <div className="animate-rise">
      <PageHeader
        title="AI safety alerts"
        description="Conversations where the AI Coach noticed a possible crisis or the member asked for a person. Urgent first, then oldest. Follow the study's safety protocol."
        count={counts.open || undefined}
      />
      <nav aria-label="Alert status" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {TABS.map((item) => {
          const count = item.id === "all" ? total : counts[item.id];
          return (
            <Link
              key={item.id}
              href={item.id === "open" ? "/admin/ai/alerts" : `/admin/ai/alerts?status=${item.id}`}
              aria-current={tab.id === item.id ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
                tab.id === item.id && "bg-card text-foreground shadow-soft",
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", item.id === "open" && count ? "bg-brand-magenta text-white" : "bg-background/70")}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>
      <AlertList alerts={list.alerts} timezone={viewer.timezone} emptyLabel={tab.empty} />
      {list.pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted-foreground">
          {list.page > 1 ? (
            <Link href={pageHref(list.page - 1)} className="font-medium text-primary hover:underline">
              Previous
            </Link>
          ) : null}
          <span className="tabular-nums">
            Page {list.page} of {list.pageCount}
          </span>
          {list.page < list.pageCount ? (
            <Link href={pageHref(list.page + 1)} className="font-medium text-primary hover:underline">
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
