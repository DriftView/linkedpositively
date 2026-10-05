import Link from "next/link";
import { BookOpen, ChevronRight, LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageIcon } from "@/features/pages/components/page-icon";
import { listMenuPages } from "@/features/pages/queries";
import { requireViewer } from "@/server/auth/session";

export const metadata = { title: "Help & info" };

/** The old "About" menu: information pages, glossary and tech support. */
export default async function PagesIndex() {
  const viewer = await requireViewer();
  const pages = await listMenuPages(viewer);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Help & info" description="How the app works, our community guidelines, and where to get support." />

      <ul className="grid gap-2.5">
        {pages.map((page, index) => (
          <li key={page.slug} className="animate-rise" style={{ animationDelay: `${index * 30}ms` }}>
            <IndexLink href={`/pages/${page.slug}`} title={page.title} summary={page.summary} icon={<PageIcon slug={page.slug} index={index} />} />
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-3 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">More help</h2>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        <li>
          <IndexLink
            href="/glossary"
            title="Glossary"
            summary="Plain-language meanings of health and rights terms."
            icon={
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-sky/15 text-brand-sky">
                <BookOpen aria-hidden className="size-5" />
              </span>
            }
          />
        </li>
        <li>
          <IndexLink
            href="/support"
            title="Tech support"
            summary="Something not working? Tell us."
            icon={
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-apricot/20 text-primary">
                <LifeBuoy aria-hidden className="size-5" />
              </span>
            }
          />
        </li>
      </ul>
    </div>
  );
}

function IndexLink({ href, title, summary, icon }: { href: string; title: string; summary: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex h-full items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-all hover:-translate-y-px hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-heading font-semibold">{title}</span>
        {summary ? <span className="mt-0.5 block text-sm text-muted-foreground">{summary}</span> : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
