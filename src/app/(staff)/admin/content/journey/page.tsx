import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { CategoryList } from "@/features/journey/components/admin/category-list";
import { journeyUsageStats, listCategories } from "@/features/journey/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Journey" };

export default async function AdminJourneyPage() {
  await requirePermission("content.manage");
  const [categories, stats] = await Promise.all([listCategories({ includeHidden: true }), journeyUsageStats()]);
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Journey"
        description="Areas of life, the “I want to…” methods in each, and the goal ideas members can take on."
        actions={
          <Button variant="outline" asChild>
            <Link href="/journey" target="_blank">
              <ExternalLink /> View as member
            </Link>
          </Button>
        }
      />
      <dl className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: "Members with goals", value: stats.members },
          { label: "Goals in progress or done", value: stats.goals },
          { label: "Goals completed", value: stats.completed },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-4">
            <dd className="text-2xl font-semibold tabular-nums">{item.value}</dd>
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
          </div>
        ))}
      </dl>
      <CategoryList categories={categories} />
    </div>
  );
}
