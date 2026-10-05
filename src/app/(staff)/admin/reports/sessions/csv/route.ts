import { csvResponse, phpCsv } from "@/features/peer-nav/csv";
import { sessionReport, sessionReportCsvRows } from "@/features/peer-nav/reports";
import { assertPermission, AuthError } from "@/server/auth/session";

/** Coach_SessionReport.csv — legacy columns and formats (admin/session-report/csv). */
export async function GET() {
  try {
    const viewer = await assertPermission("peernav.sessionReport");
    const rows = await sessionReport(viewer);
    return csvResponse(phpCsv(sessionReportCsvRows(rows)), "Coach_SessionReport.csv");
  } catch (error) {
    if (error instanceof AuthError) return new Response("Not found", { status: 404 });
    throw error;
  }
}
