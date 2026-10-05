import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function NotificationBell({ unread, href = "/notifications" }: { unread: number; href?: string }) {
  const label = unread > 0 ? `Notifications, ${unread} new` : "Notifications";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-lg" className="relative rounded-full">
          <Link href={href} aria-label={label}>
            <Bell className="size-5" />
            {unread > 0 ? (
              <span className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-brand-magenta px-1 text-[0.65rem] leading-4.5 font-semibold text-white tabular-nums ring-2 ring-background">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
