import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageEditor } from "@/features/pages/components/page-editor";
import { getPageForEdit } from "@/features/pages/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Edit page" };

export default async function EditPagePage(props: PageProps<"/admin/content/pages/[id]">) {
  await requirePermission("content.manage");
  const { id } = await props.params;
  const page = await getPageForEdit(id);
  if (!page) notFound();
  return (
    <div>
      <Link href="/admin/content/pages" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Pages
      </Link>
      <PageHeader title={page.title} description={`Last changed ${new Date(page.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`} />
      <PageEditor
        key={page.updatedAt}
        id={page.id}
        aliases={page.aliases.filter((alias) => alias !== page.slug)}
        initial={{
          title: page.title,
          slug: page.slug,
          summary: page.summary,
          bodyHtml: page.bodyHtml,
          videoUrl: page.videoUrl,
          status: page.status,
          audience: page.audience,
          inMenu: page.inMenu,
          order: page.order,
          needsReview: page.needsReview,
        }}
      />
    </div>
  );
}
