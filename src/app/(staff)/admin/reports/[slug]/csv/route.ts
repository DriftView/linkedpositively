import type { NextRequest } from "next/server";
import { csvResponse } from "@/features/peer-nav/csv";
import { parseFilters } from "@/features/reports/filters";
import { toCsv } from "@/features/reports/format";
import { effectiveFilters, findReport } from "@/features/reports/registry";
import { assertPermission, AuthError } from "@/server/auth/session";

/**
 * CSV export of a study report, with the legacy file name, headers, column
 * order and date formats. Takes the same filters as the report page.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/admin/reports/[slug]/csv">) {
  try {
    await assertPermission("reports.view");
  } catch (error) {
    if (error instanceof AuthError) return new Response("Not found", { status: 404 });
    throw error;
  }
  const { slug } = await params;
  const report = findReport(slug);
  if (!report) return new Response("Not found", { status: 404 });
  const filters = effectiveFilters(report.meta, parseFilters(request.nextUrl.searchParams, report.meta.defaultArm));
  const { csv } = await report.run(filters);
  return csvResponse(toCsv(csv.rows), csv.filename);
}
