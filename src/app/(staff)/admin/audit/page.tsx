import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { AuditTable } from "@/features/admin/components/audit-table";
import { listAudit } from "@/features/admin/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const viewer = await requirePermission("users.edit");
  const rows = await listAudit({ limit: 2000 });
  return (
    <div className="animate-rise">
      <PageHeader title="Audit log" description="Every staff action on accounts, the study arms, texts, surveys and settings. Entries can't be edited or removed." />
      <AuditTable rows={rows} timezone={viewer.timezone} />
    </div>
  );
}
