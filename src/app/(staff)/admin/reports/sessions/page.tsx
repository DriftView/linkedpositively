import Link from "next/link";
import { Download, FileBarChart } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusPill } from "@/features/peer-nav/components/bits";
import { CURRICULUM } from "@/features/peer-nav/curriculum";
import { REPORT_TIMEZONE, sessionReport } from "@/features/peer-nav/reports";
import { formatInZone } from "@/lib/dates";
import { can, requirePermission } from "@/server/auth/session";

export const metadata = { title: "Session report" };

/** Peer Navigation session status per participant (legacy /admin/session-report). */
export default async function SessionReportPage() {
  const viewer = await requirePermission("peernav.sessionReport");
  const rows = await sessionReport(viewer);
  const all = can(viewer, "peernav.allParticipants");
  const completeCounts = CURRICULUM.map((s) => rows.filter((r) => r.sessions.find((x) => x.serial === s.serial)?.status === "complete").length);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Session report"
        description={`Where each ${all ? "Peer Navigation participant" : "of your participants"} is in the six sessions. Times are Eastern.`}
        actions={
          <Button asChild variant="outline" size="lg">
            <a href="/admin/reports/sessions/csv" download>
              <Download aria-hidden />
              Export CSV
            </a>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No participants to report on yet" description="Participants appear here once they have Peer Navigation access." />
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {CURRICULUM.map((s, i) => (
              <div key={s.serial} className="rounded-xl border bg-card px-3 py-2.5 shadow-soft">
                <dt className="truncate text-xs text-muted-foreground" title={s.title}>
                  Session {s.serial}
                </dt>
                <dd className="mt-0.5 flex items-baseline gap-1">
                  <span className="font-heading text-xl font-semibold tabular-nums">{completeCounts[i]}</span>
                  <span className="text-xs text-muted-foreground">/ {rows.length} complete</span>
                </dd>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-success" style={{ width: `${(completeCounts[i] / rows.length) * 100}%` }} />
                </div>
              </div>
            ))}
          </dl>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] border-collapse text-sm">
                <caption className="sr-only">Session status by participant</caption>
                <thead>
                  <tr className="border-b bg-muted/40 text-left align-bottom text-xs text-muted-foreground">
                    <th scope="col" className="sticky left-0 z-10 bg-muted px-4 py-3 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium whitespace-nowrap">
                      Account created
                    </th>
                    {CURRICULUM.map((s) => (
                      <th key={s.serial} scope="col" className="max-w-40 px-3 py-3 font-medium">
                        <span className="line-clamp-2" title={`${s.serial}. ${s.title}`}>
                          {s.serial}. {s.title}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className="group hover:bg-muted/30">
                      <th scope="row" className="sticky left-0 z-10 min-w-44 bg-card px-4 py-3 text-left font-normal whitespace-nowrap group-hover:bg-muted">
                        <Link href={`/coach/${row.id}`} className="font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                          {row.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          @{row.username}
                          {row.blocked ? " · blocked" : ""}
                        </span>
                      </th>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {row.createdAt ? formatInZone(row.createdAt, "yyyy-MM-dd HH:mm", REPORT_TIMEZONE) : "—"}
                      </td>
                      {row.sessions.map((cell) => (
                        <td key={cell.serial} className="px-3 py-3 align-top">
                          {cell.status === "not_started" ? (
                            <StatusPill status={cell.status} className="h-5 px-1.5 text-[0.7rem]" />
                          ) : (
                            <Link
                              href={`/coach/${row.id}/sessions/${cell.serial}`}
                              className="inline-block rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              aria-label={`${cell.status === "complete" ? "Complete" : "In progress"}: open session ${cell.serial} for ${row.name}`}
                            >
                              <StatusPill status={cell.status} className="h-5 px-1.5 text-[0.7rem] hover:brightness-95" />
                            </Link>
                          )}
                          {cell.lastActivityAt ? (
                            <small className="mt-1 block text-[0.7rem] whitespace-nowrap text-muted-foreground tabular-nums">
                              {formatInZone(cell.lastActivityAt, "yyyy-MM-dd HH:mm", REPORT_TIMEZONE)}
                            </small>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
