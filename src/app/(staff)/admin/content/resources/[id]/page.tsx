import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { ResourceForm } from "@/features/resources/components/admin/resource-form";
import { geocodingEnabled } from "@/features/resources/geocode";
import { getResourceForEdit, listAllTagNames } from "@/features/resources/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Edit resource" };

const STATUS = {
  published: { label: "Published", variant: "secondary" },
  suggested: { label: "Suggested", variant: "default" },
  unpublished: { label: "Unpublished", variant: "outline" },
} as const;

export default async function EditResourcePage(props: PageProps<"/admin/content/resources/[id]">) {
  await requirePermission("resources.manage");
  const { id } = await props.params;
  const [data, tags] = await Promise.all([getResourceForEdit(id), listAllTagNames()]);
  if (!data) notFound();
  const status = STATUS[data.form.status];

  return (
    <div>
      <Link
        href={`/admin/content/resources${data.form.status === "published" ? "" : `?tab=${data.form.status}`}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Resources
      </Link>
      <PageHeader
        title={
          <>
            {data.form.title}
            <Badge variant={status.variant} className="font-sans">
              {status.label}
            </Badge>
          </>
        }
        description={`Created ${new Date(data.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · last changed ${new Date(data.updatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
      />
      <ResourceForm key={data.updatedAt} data={data} tagSuggestions={tags} geocoding={geocodingEnabled()} />
    </div>
  );
}
