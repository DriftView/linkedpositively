import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportScreen } from "@/features/reports/components/report-screen";
import { reportMeta } from "@/features/reports/catalog";
import { parseFilters } from "@/features/reports/filters";
import { effectiveFilters, findReport } from "@/features/reports/registry";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata({ params }: PageProps<"/admin/reports/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: reportMeta(slug)?.title ?? "Report" };
}

export default async function StudyReportPage({ params, searchParams }: PageProps<"/admin/reports/[slug]">) {
  await requirePermission("reports.view");
  const { slug } = await params;
  const report = findReport(slug);
  if (!report) notFound();
  const filters = effectiveFilters(report.meta, parseFilters(await searchParams, report.meta.defaultArm));
  const { view } = await report.run(filters);
  return <ReportScreen key={slug} meta={report.meta} filters={filters} view={view} />;
}
