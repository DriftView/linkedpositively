"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ImpersonationBanner } from "@/features/admin/components/impersonation-banner";
import { NavIcon } from "./nav-icon";
import { PageViewBeacon } from "./page-view-beacon";
import type { NavGroup } from "./nav-types";
import { NotificationBell } from "./notification-bell";
import { UserMenu, type ShellUser } from "./user-menu";

function isActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/coach") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Layout for study staff and peer navigators: collapsible sidebar + wide content. */
export function StaffShell({
  groups,
  user,
  unread,
  bellHref,
  children,
}: {
  groups: NavGroup[];
  user: ShellUser;
  unread: number;
  bellHref?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const home = groups[0]?.items[0]?.href ?? "/admin";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Link Positively">
                <Link href={home}>
                  <LogoMark className="size-8 text-primary" />
                  <span className="flex flex-col leading-tight">
                    <span className="font-heading font-semibold">Link Positively</span>
                    <span className="text-xs text-muted-foreground">Study workspace</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.label}>
                      <Link href={item.href}>
                        <NavIcon name={item.icon} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        {user.impersonating ? <ImpersonationBanner name={user.name} /> : <PageViewBeacon />}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <div className="ml-auto flex items-center gap-1">
            {bellHref ? <NotificationBell unread={unread} href={bellHref} /> : null}
            <UserMenu user={user} profileHref="/settings" />
          </div>
        </header>
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
