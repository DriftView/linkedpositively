import Link from "next/link";
import { EyeOff, FileText, ListChecks, Lock, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListPages } from "@/features/pages/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Pages" };

export default async function AdminPagesPage() {
  await requirePermission("content.manage");
  const pages = await adminListPages();
  const review = pages.filter((page) => page.needsReview).length;

  return (
    <div>
      <PageHeader
        title="Pages"
        description="Information pages: About, FAQ, Get help, Community guidelines, Terms and more."
        actions={
          <Button asChild>
            <Link href="/admin/content/pages/new">
              <Plus /> New page
            </Link>
          </Button>
        }
      />
      {review ? (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <ListChecks className="size-4 shrink-0" aria-hidden />
          {review} {review === 1 ? "page has" : "pages have"} starter copy that the study team should review before launch.
        </p>
      ) : null}
      {pages.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Page</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">On Help &amp; info</TableHead>
                <TableHead className="hidden lg:table-cell">Last edited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell>
                    <Link href={`/admin/content/pages/${page.id}`} className="font-medium hover:text-primary hover:underline">
                      {page.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      /pages/{page.slug}
                      {page.needsReview ? (
                        <Badge variant="outline" className="border-warning/60 font-normal">
                          Review copy
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {page.status === "draft" ? (
                      <Badge variant="outline">
                        <EyeOff /> Draft
                      </Badge>
                    ) : page.audience === "staff" ? (
                      <Badge variant="secondary">
                        <Lock /> Staff only
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Published</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{page.inMenu ? `Yes · #${page.order}` : <span className="text-muted-foreground">No</span>}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {new Date(page.updatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                    {page.updatedByName ? ` by ${page.updatedByName}` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No pages yet</EmptyTitle>
            <EmptyDescription>Create the About, FAQ and Community guidelines pages members will look for.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/admin/content/pages/new">
                <Plus /> New page
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
