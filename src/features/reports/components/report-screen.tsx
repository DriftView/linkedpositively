import Link from "next/link";
import { ChevronLeft, Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { ReportMeta } from "../catalog";
import { ARMS, ARM_LABELS, describeRange, filtersQuery, type ReportFilters } from "../filters";
import type { Thread } from "../queries/community";
import type { CheckinStrip } from "../queries/tracking";
import type { ReportView } from "../types";
import { CheckinGrid } from "./checkin-grid";
import { ReportChart } from "./report-chart";
import { ReportFiltersBar } from "./report-filters";
import { GapsNotice, MissingSidNotice, ReportNotes, ReportTiles } from "./report-parts";
import { ReportTable } from "./report-table";
import { ThreadList } from "./thread-list";

function isEmpty(view: ReportView) {
  if (view.layout === "thread") return !(view.extra as { total: number }).total;
  if (view.layout === "checkin") return !(view.extra as { strips: CheckinStrip[] }).strips.length;
  return !view.rows.length;
}

/** One study report: header with export, filters, tiles, chart, data and notes. */
export function ReportScreen({ meta, filters, view }: { meta: ReportMeta; filters: ReportFilters; view: ReportView }) {
  const query = filtersQuery(filters, meta.defaultArm);
  const arms = meta.defaultArm === "everyone" ? [...ARMS] : ARMS.filter((arm) => arm !== "everyone");
  const scope = [ARM_LABELS[filters.arm], meta.dated ? describeRange(filters) : "As of today", filters.sid ? `study ID contains “${filters.sid}”` : null]
    .filter(Boolean)
    .join(" · ");
  const empty = isEmpty(view);

  return (
    // `contain: inline-size` keeps wide tables from stretching the staff shell
    // (its content column has no min-width: 0); they scroll inside their card.
    <div className="animate-rise [contain:inline-size]">
      <Link
        href="/admin/reports"
        className="mb-3 inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Reports
      </Link>
      <PageHeader
        title={
          <>
            {meta.title}
            {meta.badge ? (
              <Badge variant="secondary" className="font-sans">
                {meta.badge}
              </Badge>
            ) : null}
          </>
        }
        description={
          <>
            {meta.summary} <span className="text-foreground/80">{scope}.</span>
          </>
        }
        actions={
          <Button asChild variant="outline" size="lg">
            <a href={`/admin/reports/${meta.slug}/csv${query}`} download={meta.filename}>
              <Download aria-hidden />
              Export CSV
            </a>
          </Button>
        }
      />

      <ReportFiltersBar filters={filters} defaultArm={meta.defaultArm} arms={arms} dated={meta.dated} />
      <MissingSidNotice count={view.missingSid} />
      <GapsNotice gaps={view.gaps} />
      <ReportTiles tiles={view.tiles} />

      {empty ? (
        <Empty className="rounded-2xl border bg-card py-14 shadow-soft">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSpreadsheet aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Nothing to show for these filters</EmptyTitle>
            <EmptyDescription>
              {meta.dated && (filters.from || filters.to) ? "Try a longer period or “All time”." : "Once participants use this part of the app, their activity will appear here."}
              {filters.sid ? " Or clear the study ID search." : ""}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-5">
          {view.chart ? <ReportChart chart={view.chart} /> : null}
          {view.layout === "thread" ? (
            <ThreadList {...(view.extra as { threads: Thread[]; total: number })} />
          ) : view.layout === "checkin" ? (
            <CheckinGrid {...(view.extra as { strips: CheckinStrip[]; days: number })} />
          ) : (
            <ReportTable columns={view.columns} rows={view.rows} searchKeys={view.searchKeys} initialSort={view.initialSort} noun={view.rows.length === 1 ? "row" : "rows"} />
          )}
        </div>
      )}

      <ReportNotes notes={view.notes} filename={meta.filename} legacyLayout={meta.badge !== "New"} />
    </div>
  );
}
