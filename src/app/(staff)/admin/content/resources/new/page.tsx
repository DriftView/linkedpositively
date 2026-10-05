import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ResourceForm } from "@/features/resources/components/admin/resource-form";
import { geocodingEnabled } from "@/features/resources/geocode";
import { listAllTagNames } from "@/features/resources/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "New resource" };

export default async function NewResourcePage() {
  await requirePermission("resources.manage");
  const tags = await listAllTagNames();
  return (
    <div>
      <Link href="/admin/content/resources" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Resources
      </Link>
      <PageHeader title="New resource" description="Add a place to the resource locator." />
      <ResourceForm tagSuggestions={tags} geocoding={geocodingEnabled()} />
    </div>
  );
}
