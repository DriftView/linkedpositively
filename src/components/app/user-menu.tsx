"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Settings, Sun, UserRound, VenetianMask } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { stopImpersonatingAction } from "@/features/admin/actions";
import { announceAuthChange, authClientFor } from "@/lib/auth-client";
import { initials } from "@/lib/initials";
import { usePortal } from "./portal-context";

export type ShellUser = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  roleLabel: string;
  impersonating: boolean;
};

export function UserMenu({ user, profileHref = "/profile" }: { user: ShellUser; profileHref?: string }) {
  const { theme, setTheme } = useTheme();
  const portal = usePortal();

  async function signOut() {
    await authClientFor(portal).signOut();
    announceAuthChange(portal);
    // A full load, so nothing from this account stays in the client cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  async function stopImpersonating() {
    const result = await stopImpersonatingAction();
    if (!result?.data) return toast.error("Couldn't switch back. Please sign in again.");
    announceAuthChange(portal);
    window.location.assign(result.data.destination);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ml-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        <Avatar className="size-9 ring-2 ring-background">
          <AvatarImage src={`/api/avatars/${user.id}`} alt="" className="object-cover" />
          <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        {user.impersonating ? (
          <span className="absolute -mt-2 ml-6 size-3 rounded-full bg-warning ring-2 ring-background" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-semibold">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            @{user.username} · {user.roleLabel}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <UserRound /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={portal === "staff" ? "/account" : "/settings"}>
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {user.impersonating ? (
          <DropdownMenuItem onSelect={stopImpersonating}>
            <VenetianMask /> Switch back to my account
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
