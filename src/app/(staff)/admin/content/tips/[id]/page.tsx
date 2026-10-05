import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { adminTagOptions, tipEngagement, tipForEdit } from "@/features/tips/admin-queries";
import { TipEditor } from "@/features/tips/components/admin/tip-editor";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Edit tip" };

export default async function EditTipPage({ params }: PageProps<"/admin/content/tips/[id]">) {
  await requirePermission("content.manage");
  const { id } = await params;
  const [tip, options, engagement] = await Promise.all([tipForEdit(id), adminTagOptions(), tipEngagement(id)]);
  if (!tip) notFound();
  return (
    <div>
      <Link href="/admin/content/tips" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Thrive Tips
      </Link>
      <PageHeader
        title="Edit tip"
        actions={
          tip.published ? (
            <Button variant="outline" asChild>
              <Link href={`/tips/${tip.id}`} target="_blank">
                View as participant <ExternalLink />
              </Link>
            </Button>
          ) : null
        }
      />
      <TipEditor
        key={tip.id}
        initial={tip}
        engagement={engagement}
        tags={options.filter((t) => t.kind === "tag").map(({ id, name }) => ({ id, name }))}
        categories={options.filter((t) => t.kind === "category").map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
