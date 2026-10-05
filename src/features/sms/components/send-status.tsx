import { CircleAlert, CircleCheck, CircleDashed, CircleSlash, Clock3, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SendStatus } from "../types";

const STYLES: Record<SendStatus, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  scheduled: { label: "Scheduled", className: "bg-brand-sky/15 text-foreground ring-brand-sky/40", icon: Clock3 },
  sending: { label: "Sending", className: "bg-secondary text-secondary-foreground ring-primary/20", icon: Loader },
  sent: { label: "Sent", className: "bg-success/12 text-foreground ring-success/35", icon: CircleCheck },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive ring-destructive/30", icon: CircleAlert },
  skipped: { label: "Skipped", className: "bg-warning/15 text-foreground ring-warning/45", icon: CircleDashed },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground ring-border", icon: CircleSlash },
};

export function SendStatusBadge({ status, className }: { status: SendStatus; className?: string }) {
  const style = STYLES[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        style.className,
        className,
      )}
    >
      <Icon className={cn("size-3.5", status === "sent" && "text-success", status === "scheduled" && "text-brand-sky")} aria-hidden />
      {style.label}
    </span>
  );
}

export function flagLabel(flag: string) {
  if (flag === "WELCOME") return "Welcome";
  const week = /^WEEK-(\d+)$/.exec(flag);
  return week ? `Week ${week[1]}` : flag;
}
