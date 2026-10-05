import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageEditor } from "@/features/pages/components/page-editor";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "New page" };

export default async function NewPagePage() {
  await requirePermission("content.manage");
  return (
    <div>
      <Link href="/admin/content/pages" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Pages
      </Link>
      <PageHeader title="New page" />
      <PageEditor />
    </div>
  );
}
