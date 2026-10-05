import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff, Pencil } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryDialog } from "@/features/journey/components/admin/category-dialog";
import { DeleteCategoryButton } from "@/features/journey/components/admin/delete-category";
import { MethodEditor } from "@/features/journey/components/admin/method-editor";
import { getCategoryWithGoals } from "@/features/journey/queries";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { journeyCategories } from "@/server/db/schema";

export const metadata = { title: "Edit journey area" };

export default async function AdminJourneyCategoryPage(props: PageProps<"/admin/content/journey/[id]">) {
  await requirePermission("content.manage");
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [category] = await db
    .select({ slug: journeyCategories.slug })
    .from(journeyCategories)
    .where(eq(journeyCategories.id, id))
    .limit(1);
  if (!category) notFound();
  const data = await getCategoryWithGoals(category.slug, { includeHidden: true });
  if (!data) notFound();

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/content/journey"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Journey
      </Link>
      <PageHeader
        title={
          <>
            {data.category.name}
            {!data.category.published ? (
              <Badge variant="outline" className="font-sans">
                <EyeOff /> Hidden
              </Badge>
            ) : null}
          </>
        }
        description={data.category.description}
        actions={
          <>
            <CategoryDialog
              initial={{
                id: data.category.id,
                name: data.category.name,
                description: data.category.description,
                accent: data.category.accent,
                published: data.category.published,
              }}
              trigger={
                <Button variant="outline">
                  <Pencil /> Edit area
                </Button>
              }
            />
            <DeleteCategoryButton id={data.category.id} name={data.category.name} />
          </>
        }
      />
      <MethodEditor categoryId={data.category.id} methods={data.methods} />
    </div>
  );
}
