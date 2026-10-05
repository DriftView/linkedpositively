import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { SupportQueue } from "@/features/support/components/support-queue";
import { adminListTickets, adminTicketCounts } from "@/features/support/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import type { SupportStatus } from "@/server/db/schema";

export const metadata = { title: "Tech support" };

const TABS: { id: SupportStatus | "all"; label: string; empty: string }[] = [
  { id: "open", label: "New", empty: "No new requests. They show up here as soon as someone asks for help." },
  { id: "in_progress", label: "In progress", empty: "Nothing in progress." },
  { id: "resolved", label: "Resolved", empty: "No resolved requests yet." },
  { id: "all", label: "All", empty: "No requests yet." },
];

export default async function AdminSupportPage(props: PageProps<"/admin/support">) {
  const viewer = await requirePermission("support.manage");
  const params = await props.searchParams;
  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const tab = TABS.find((item) => item.id === requested) ?? TABS[0];
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);
  const [counts, list] = await Promise.all([adminTicketCounts(), adminListTickets({ status: tab.id, page })]);
  const pageHref = (target: number) =>
    `/admin/support?${new URLSearchParams({ ...(tab.id === "open" ? {} : { status: tab.id }), page: String(target) })}`;
  const total = counts.open + counts.in_progress + counts.resolved;

  return (
    <div>
      <PageHeader
        title="Tech support"
        description="Requests members send from the Tech support page. Oldest first, so nobody waits too long."
        count={counts.open || undefined}
      />
      <nav aria-label="Request status" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {TABS.map((item) => {
          const count = item.id === "all" ? total : counts[item.id];
          return (
            <Link
              key={item.id}
              href={item.id === "open" ? "/admin/support" : `/admin/support?status=${item.id}`}
              aria-current={tab.id === item.id ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
                tab.id === item.id && "bg-card text-foreground shadow-soft",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  item.id === "open" && count ? "bg-brand-magenta text-white" : "bg-background/70",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>
      <SupportQueue tickets={list.tickets} timezone={viewer.timezone} emptyLabel={tab.empty} />
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
