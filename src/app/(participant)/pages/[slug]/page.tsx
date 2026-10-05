import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, EyeOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageIcon } from "@/features/pages/components/page-icon";
import { PageViewTracker } from "@/features/pages/components/page-view-tracker";
import { getPageForViewer, listMenuPages, resolveLegacyPage } from "@/features/pages/queries";
import { friendlyDate } from "@/lib/dates";
import { can, requireViewer } from "@/server/auth/session";

export async function generateMetadata(props: PageProps<"/pages/[slug]">) {
  const viewer = await requireViewer();
  const { slug } = await props.params;
  const page = await getPageForViewer(slug, viewer);
  return { title: page?.title ?? "Page", description: page?.summary };
}

export default async function InfoPage(props: PageProps<"/pages/[slug]">) {
  const viewer = await requireViewer();
  const { slug } = await props.params;
  const [page, menu] = await Promise.all([getPageForViewer(slug, viewer), listMenuPages(viewer)]);
  if (!page) {
    // Renamed pages keep their old address as an alias.
    const moved = await resolveLegacyPage({ alias: slug });
    if (moved && moved !== slug) redirect(`/pages/${moved}`);
    notFound();
  }
  const others = menu.filter((item) => item.slug !== page.slug).slice(0, 4);
  const hidden = page.status === "draft" || page.audience === "staff";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/pages" className="inline-flex h-10 items-center gap-1.5 pr-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-4" />
          Help &amp; info
        </Link>
        {can(viewer, "content.manage") ? (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={`/admin/content/pages/${page.id}`}>
              <Pencil aria-hidden />
              Edit page
            </Link>
          </Button>
        ) : null}
      </div>

      {hidden ? (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-warning/20 px-4 py-3 text-sm">
          <EyeOff aria-hidden className="size-4 shrink-0" />
          {page.status === "draft" ? "This page is a draft. Only staff can see it." : "This page is for staff only."}
        </p>
      ) : null}

      <article className="animate-rise overflow-hidden rounded-3xl border bg-card shadow-soft">
        <header className="bg-gradient-to-br from-secondary via-card to-card px-5 pt-7 pb-6 sm:px-9 sm:pt-9">
          <PageIcon slug={page.slug} className="size-12" />
          <h1 className="mt-4 text-[1.85rem] leading-tight font-semibold sm:text-4xl">{page.title}</h1>
          {page.summary ? <p className="mt-2 text-lg text-muted-foreground">{page.summary}</p> : null}
        </header>
        <div className="px-5 pb-8 sm:px-9">
          {page.videoEmbed ? (
            <div className="mb-6 aspect-video overflow-hidden rounded-2xl bg-muted">
              <iframe
                src={page.videoEmbed}
                title={`Video: ${page.title}`}
                className="size-full"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          ) : null}
          {/* Stored HTML is sanitized with sanitizeStaffHtml when saved. */}
          <div className="prose-content text-[1.02rem] leading-8" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
          <p className="mt-8 border-t pt-4 text-sm text-muted-foreground">Last updated {friendlyDate(page.updatedAt, viewer.timezone)}</p>
        </div>
      </article>

      {others.length ? (
        <nav aria-label="More help pages" className="mt-8">
          <h2 className="mb-3 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Keep reading</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {others.map((item, index) => (
              <li key={item.slug}>
                <Link
                  href={`/pages/${item.slug}`}
                  className="group flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent"
                >
                  <PageIcon slug={item.slug} index={index + 1} className="size-10" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {!hidden ? <PageViewTracker slug={page.slug} /> : null}
    </div>
  );
}
