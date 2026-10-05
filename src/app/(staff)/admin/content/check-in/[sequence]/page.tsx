import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PromptEditor } from "@/features/checkin/components/admin/prompt-editor";
import { promptForEdit } from "@/features/checkin/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Edit check-in prompt" };

export default async function EditPromptPage({ params }: PageProps<"/admin/content/check-in/[sequence]">) {
  await requirePermission("content.manage");
  const sequence = Number((await params).sequence);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 10) notFound();
  const { exists, values } = await promptForEdit(sequence);
  return (
    <div>
      <Link href="/admin/content/check-in" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Check-in prompts
      </Link>
      <PageHeader title={`Week ${sequence} prompt`} />
      <PromptEditor key={sequence} initial={values} exists={exists} />
    </div>
  );
}
