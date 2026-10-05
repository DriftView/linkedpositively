import "server-only";
import Link from "next/link";
import { ArrowRight, BookOpen, HeartHandshake, LifeBuoy, UserRound } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { listMenuPages } from "@/features/pages/queries";
import { getViewer } from "@/server/auth/session";

/**
 * Home for accounts without the intervention features (control arm, or
 * before randomization): a warm welcome, what the study is, and the info
 * pages they can use. No wall.
 */
export async function ControlHome({ name }: { name: string }) {
  const viewer = await getViewer();
  const pages = viewer ? await listMenuPages(viewer).catch(() => []) : [];
  const links = [
    ...pages.slice(0, 6).map((page) => ({ href: `/pages/${page.slug}`, title: page.title, summary: page.summary, icon: BookOpen })),
    { href: "/glossary", title: "Glossary", summary: "Plain-language definitions of health and study terms.", icon: BookOpen },
    { href: "/profile", title: "Your profile", summary: "Your details and account settings.", icon: UserRound },
  ];

  return (
    <div className="space-y-6">
      <section className="relative animate-rise overflow-hidden rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand-magenta)_18%,transparent),transparent_70%)]"
        />
        <LogoMark className="size-12 text-primary" />
        <h1 className="mt-4 text-[1.65rem] leading-tight font-semibold sm:text-3xl">Welcome, {name}</h1>
        <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-muted-foreground">
          Thank you for being part of the Link Positively study. Your participation helps us learn how to better support
          young people living with HIV. The study team will be in touch about next steps, and you&apos;ll find helpful
          information below in the meantime.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/pages/help"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <LifeBuoy className="size-4" /> Get help
          </Link>
          <Link
            href="/pages/research-study"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-5 text-sm font-semibold text-secondary-foreground transition hover:bg-accent"
          >
            <HeartHandshake className="size-4" /> About the study
          </Link>
        </div>
      </section>

      <section aria-labelledby="info-title" className="animate-rise [animation-delay:80ms]">
        <h2 id="info-title" className="mb-3 text-lg font-semibold">
          Helpful information
        </h2>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:shadow-lift"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                  <link.icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-semibold">
                    {link.title}
                    <ArrowRight className="size-4 text-primary opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                  {link.summary ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{link.summary}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
