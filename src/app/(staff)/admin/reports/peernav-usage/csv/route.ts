import { csvResponse, phpCsv } from "@/features/peer-nav/csv";
import { usageReportCsvRows } from "@/features/peer-nav/reports";
import { assertPermission, AuthError } from "@/server/auth/session";

/** eCoach_Standard_Usage_Report.csv — every recorded participant sign-in, newest first. */
export async function GET() {
  try {
    const viewer = await assertPermission("peernav.sessionReport");
    return csvResponse(phpCsv(await usageReportCsvRows(viewer)), "eCoach_Standard_Usage_Report.csv");
  } catch (error) {
    if (error instanceof AuthError) return new Response("Not found", { status: 404 });
    throw error;
  }
}
