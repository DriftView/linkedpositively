import { PageHeader } from "@/components/app/page-header";
import { adminTagOptions } from "@/features/tips/admin-queries";
import { AdminTipsNav } from "@/features/tips/components/admin/admin-tips-nav";
import { TopicsManager } from "@/features/tips/components/admin/topics-manager";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Tip topics" };

export default async function TipTopicsPage() {
  await requirePermission("content.manage");
  const items = await adminTagOptions();
  return (
    <div>
      <PageHeader title="Thrive Tips" description="Topics and categories used to organise tips." />
      <AdminTipsNav />
      <TopicsManager items={items} />
    </div>
  );
}
