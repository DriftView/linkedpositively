import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, MonitorSmartphone } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/peer-nav/components/bits";
import { deviceSummary, usageDateTime } from "@/features/peer-nav/format";
import { REPORT_TIMEZONE, USAGE_PAGE_SIZE, usageReportPage } from "@/features/peer-nav/reports";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Peer Navigation usage report" };

/** eCoach standard usage report (legacy module was disabled; built here). */
export default async function PeerNavUsageReportPage({ searchParams }: PageProps<"/admin/reports/peernav-usage">) {
  const viewer = await requirePermission("peernav.sessionReport");
  const query = await searchParams;
  const requested = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const report = await usageReportPage(viewer, requested);
  const page = Math.min(requested, report.pages);
  const first = report.total ? (page - 1) * USAGE_PAGE_SIZE + 1 : 0;
  const last = Math.min(report.total, page * USAGE_PAGE_SIZE);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Peer Navigation usage"
        description={
          <>
            Sessions are recorded from the date this module was enabled. A duration of &quot;Incomplete&quot; means no logout event was observed.
          </>
        }
        actions={
          <Button asChild variant="outline" size="lg">
            <a href="/admin/reports/peernav-usage/csv" download>
              <Download aria-hidden />
              Export CSV
            </a>
          </Button>
        }
      />

      {report.total === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No participant sessions have been recorded." description="Sign-ins by Peer Navigation participants will be listed here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">Participant sign-in sessions, newest first</caption>
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Participant SID</th>
                  <th scope="col" className="px-4 py-3 font-medium">Login date and time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Type of device used</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total session duration</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[0.8rem]">{row.participantSid}</span>
                      {row.name ? <span className="block text-xs text-muted-foreground">{row.name}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{usageDateTime(row.loginAt, REPORT_TIMEZONE)}</td>
                    <td className="max-w-xs px-4 py-2.5">
                      <span className="block font-medium">{deviceSummary(row.userAgent)}</span>
                      <span className="block truncate text-xs text-muted-foreground" title={row.userAgent}>
                        {row.userAgent || "Not recorded"}
                      </span>
                    </td>
                    <td className={cn("px-4 py-2.5 text-right whitespace-nowrap tabular-nums", row.duration === "Incomplete" && "text-muted-foreground italic")}>
                      {row.duration}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {first}–{last} of {report.total}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="lg">
                  <Link href={`/admin/reports/peernav-usage?page=${page - 1}`}>
                    <ChevronLeft aria-hidden />
                    Newer
                  </Link>
                </Button>
              ) : null}
              {page < report.pages ? (
                <Button asChild variant="outline" size="lg">
                  <Link href={`/admin/reports/peernav-usage?page=${page + 1}`}>
                    Older
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
