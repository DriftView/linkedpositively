import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { adminTagOptions } from "@/features/tips/admin-queries";
import { EMPTY_TIP, TipEditor } from "@/features/tips/components/admin/tip-editor";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "New tip" };

export default async function NewTipPage() {
  await requirePermission("content.manage");
  const options = await adminTagOptions();
  return (
    <div>
      <Link href="/admin/content/tips" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Thrive Tips
      </Link>
      <PageHeader title="New tip" />
      <TipEditor
        initial={EMPTY_TIP}
        tags={options.filter((t) => t.kind === "tag").map(({ id, name }) => ({ id, name }))}
        categories={options.filter((t) => t.kind === "category").map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
