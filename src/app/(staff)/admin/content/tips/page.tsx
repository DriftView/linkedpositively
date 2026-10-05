import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { adminTagOptions, adminTipRows, adminTipStats } from "@/features/tips/admin-queries";
import { AdminTipsNav } from "@/features/tips/components/admin/admin-tips-nav";
import { TipsTable } from "@/features/tips/components/admin/tips-table";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Thrive Tips" };

export default async function AdminTipsPage({ searchParams }: PageProps<"/admin/content/tips">) {
  await requirePermission("content.manage");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filter = { q: one(params.q), type: one(params.type), tag: one(params.tag), status: one(params.status), sort: one(params.sort) };
  const [rows, tags, stats] = await Promise.all([adminTipRows(filter), adminTagOptions(), adminTipStats()]);

  return (
    <div>
      <PageHeader
        title="Thrive Tips"
        description={`${stats.published} published of ${stats.total} · ${stats.tailored} tailored${stats.unscheduled ? ` · ${stats.unscheduled} not scheduled` : ""}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/admin/content/tips/export" download>
                <Download /> Export CSV
              </a>
            </Button>
            <Button asChild>
              <Link href="/admin/content/tips/new">
                <Plus /> New tip
              </Link>
            </Button>
          </>
        }
      />
      <AdminTipsNav />
      <TipsTable rows={rows} tags={tags} />
    </div>
  );
}
