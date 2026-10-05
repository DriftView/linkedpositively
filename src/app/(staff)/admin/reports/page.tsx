import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ReportHub } from "@/features/reports/components/report-hub";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Reports" };

/** Study reports hub (legacy admin/uy-reports "LinkPositively Reports"). */
export default async function ReportsHubPage() {
  const viewer = await requirePermission("reports.view");
  return (
    <div className="animate-rise">
      <PageHeader
        title="Reports"
        description="Study reports for the research team. Each one opens with filters and a summary; its CSV keeps the old file name and columns so existing analysis scripts still work."
      />
      <ReportHub showPeerNav={can(viewer, "peernav.sessionReport")} />
    </div>
  );
}
