"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { NavIcon } from "./nav-icon";
import { PageViewBeacon } from "./page-view-beacon";
import type { NavItem } from "./nav-types";
import { UserMenu, type ShellUser } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { SearchButton } from "./search-button";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Layout for participants: a slim top bar, a navigation rail on large
 * screens and a thumb-friendly tab bar on phones. Content sits in a
 * comfortable reading column.
 */
export function ParticipantShell({
  nav,
  user,
  unread,
  bellHref = "/notifications",
  programName,
  aside,
  children,
}: {
  nav: NavItem[];
  user: ShellUser;
  unread: number;
  bellHref?: string;
  programName: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const primary = nav.filter((item) => item.primary).slice(0, 4);
  const more = nav.filter((item) => !primary.includes(item));

  return (
    <div className="min-h-dvh bg-background">
      {user.impersonating ? <ImpersonationBanner name={user.name} /> : <PageViewBeacon />}
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex h-15 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <LogoMark className="size-8 text-primary" />
            <span className="font-heading text-[1.05rem] font-semibold tracking-tight">{programName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <SearchButton />
            <NotificationBell unread={unread} href={bellHref} />
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 sm:px-6">
        <nav aria-label="Main" className="sticky top-15 hidden h-[calc(100dvh-3.75rem)] w-56 shrink-0 flex-col gap-1 overflow-y-auto py-6 lg:flex">
          {nav.map((item) => (
            <RailLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>

        <main id="main" className="min-w-0 flex-1 pt-5 pb-28 sm:pt-7 lg:pb-12">
          {children}
        </main>

        {aside ? <aside className="sticky top-15 hidden h-fit w-72 shrink-0 space-y-4 py-7 xl:block">{aside}</aside> : null}
      </div>

      <MobileTabBar primary={primary} more={more} pathname={pathname} />
    </div>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noreferrer" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.925rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "text-foreground hover:bg-transparent",
      )}
    >
      {active ? (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-xl bg-secondary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      ) : null}
      <NavIcon name={item.icon} className={cn("relative size-[1.15rem]", active && "text-primary")} />
      <span className="relative">{item.label}</span>
      {item.tag ? (
        <span className="relative ml-auto rounded-full bg-primary/10 px-2 text-[0.65rem] leading-5 font-semibold text-primary">
          {item.tag}
        </span>
      ) : null}
      {item.badge ? (
        <span className="relative ml-auto rounded-full bg-brand-magenta px-1.5 text-[0.7rem] leading-5 font-semibold text-white tabular-nums">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function MobileTabBar({ primary, more, pathname }: { primary: NavItem[]; more: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const moreActive = more.some((item) => isActive(pathname, item.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium text-muted-foreground"
              >
                {active ? (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute top-2 h-8 w-14 rounded-full bg-secondary"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ) : null}
                <span className="relative">
                  <NavIcon name={item.icon} className={cn("size-5", active && "text-primary")} />
                  {item.badge ? (
                    <span className="absolute -top-1 -right-1.5 size-2 rounded-full bg-brand-magenta ring-2 ring-background" />
                  ) : null}
                </span>
                <span className={cn("relative", active && "text-foreground")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium text-muted-foreground"
              aria-label="More pages"
            >
              {moreActive ? <span className="absolute top-2 h-8 w-14 rounded-full bg-secondary" /> : null}
              <Ellipsis className={cn("relative size-5", moreActive && "text-primary")} />
              <span className={cn("relative", moreActive && "text-foreground")}>More</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <ul className="grid grid-cols-3 gap-2 px-4">
                {more.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noreferrer" : undefined}
                      className={cn(
                        "flex aspect-[5/4] flex-col items-center justify-center gap-2 rounded-2xl bg-muted/60 p-2 text-center text-xs font-medium transition-colors active:scale-[0.98]",
                        isActive(pathname, item.href) && "bg-secondary text-secondary-foreground",
                      )}
                    >
                      <NavIcon name={item.icon} className="size-5 text-primary" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
