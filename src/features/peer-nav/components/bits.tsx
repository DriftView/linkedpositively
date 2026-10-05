import { Check, CircleDashed, Clock3 } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "../format";

const STATUS_STYLE: Record<SessionStatus, { label: string; className: string; icon: typeof Check }> = {
  complete: { label: "Complete", className: "bg-success/12 text-success dark:bg-success/18", icon: Check },
  in_progress: {
    label: "In progress",
    className: "bg-brand-apricot/25 text-warning-foreground dark:bg-brand-apricot/15 dark:text-brand-apricot",
    icon: Clock3,
  },
  not_started: { label: "Not started", className: "bg-muted text-muted-foreground", icon: CircleDashed },
};

/** Small status chip for a coaching session. */
export function StatusPill({ status, className }: { status: SessionStatus; className?: string }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        style.className,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
      {style.label}
    </span>
  );
}

/** Circular progress (e.g. 3 of 6 sessions). Decorative; pair it with text. */
export function ProgressRing({
  value,
  total,
  size = 36,
  stroke = 3.5,
  className,
  children,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total ? Math.min(1, value / total) : 0;
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn("transition-[stroke-dashoffset] duration-500", fraction >= 1 ? "stroke-success" : "stroke-primary")}
        />
      </svg>
      {children ? <span className="absolute inset-0 grid place-items-center">{children}</span> : null}
    </span>
  );
}

/** Friendly empty state in a quiet well. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("rounded-2xl border border-dashed bg-muted/40 py-10", className)}>
      <EmptyHeader>
        <EmptyMedia className="size-12 rounded-2xl bg-secondary text-secondary-foreground">
          <Icon className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}

/** A label/value row for definition lists. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="flex flex-col gap-0.5 py-3 @sm:grid @sm:grid-cols-[9rem_1fr] @sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm font-medium break-words", empty && "font-normal text-muted-foreground/70")}>{empty ? "Not set" : children}</dd>
    </div>
  );
}
