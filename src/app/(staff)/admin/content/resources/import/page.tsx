import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { CsvImport } from "@/features/resources/components/admin/csv-import";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Import resources" };

export default async function ImportResourcesPage() {
  await requirePermission("resources.manage");
  return (
    <div>
      <Link href="/admin/content/resources" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Resources
      </Link>
      <PageHeader title="Import resources" description="Add many resources at once from a spreadsheet. The old Feeds column names work as-is." />
      <CsvImport />
    </div>
  );
}
