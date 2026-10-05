"use client";

import Link from "next/link";
import { useState } from "react";
import { friendlyDate, formatInZone, shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABELS, type Role } from "@/server/auth/roles";

const ROLE_STYLES: Record<Role, string> = {
  admin: "bg-foreground/90 text-background",
  research_admin: "bg-brand-sky/20 text-foreground ring-1 ring-brand-sky/40 ring-inset",
  coordinator: "bg-brand-sky/20 text-foreground ring-1 ring-brand-sky/40 ring-inset",
  coach: "bg-brand-apricot/25 text-foreground ring-1 ring-brand-apricot/50 ring-inset",
  participant: "bg-primary/10 text-primary ring-1 ring-primary/25 ring-inset dark:bg-primary/20",
  control: "bg-muted text-muted-foreground ring-1 ring-border ring-inset",
  ecoach_user: "bg-brand-magenta/10 text-brand-magenta ring-1 ring-brand-magenta/25 ring-inset dark:bg-brand-magenta/20",
};

const SHORT_LABELS: Partial<Record<Role, string>> = {
  research_admin: "Research admin",
  ecoach_user: "Peer Navigation",
  coach: "Peer navigator",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      title={ROLE_LABELS[role]}
      className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.72rem] font-medium whitespace-nowrap", ROLE_STYLES[role], className)}
    >
      {SHORT_LABELS[role] ?? ROLE_LABELS[role]}
    </span>
  );
}

const ROLE_ORDER: Role[] = ["admin", "research_admin", "coordinator", "coach", "participant", "control", "ecoach_user"];

export function RoleBadges({ roles }: { roles: Role[] }) {
  const sorted = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  return (
    <span className="flex flex-wrap gap-1 xl:flex-nowrap">
      {sorted.map((role) => (
        <RoleBadge key={role} role={role} />
      ))}
    </span>
  );
}

export function StatusDot({ tone, children }: { tone: "success" | "muted" | "warning" | "destructive" | "primary"; children: React.ReactNode }) {
  const dot = {
    success: "bg-success",
    muted: "bg-muted-foreground/50",
    warning: "bg-warning",
    destructive: "bg-destructive",
    primary: "bg-primary",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {children}
    </span>
  );
}

/** Relative time with the exact date on hover. */
export function TimeAgo({ date, timezone, fallback = "—" }: { date: string | null; timezone: string; fallback?: string }) {
  if (!date) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <time dateTime={date} title={formatInZone(date, "PPpp", timezone)} suppressHydrationWarning className="whitespace-nowrap">
      {shortAgo(date, timezone)}
    </time>
  );
}

export function DateText({ date, timezone, pattern, fallback = "—" }: { date: string | null; timezone: string; pattern?: string; fallback?: string }) {
  if (!date) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <time dateTime={date} title={formatInZone(date, "PPpp", timezone)} suppressHydrationWarning className="whitespace-nowrap">
      {pattern ? formatInZone(date, pattern, timezone) : friendlyDate(date, timezone)}
    </time>
  );
}

/** A thin 24-week progress bar for a participant's study week. */
export function WeekProgress({ week, total = 24 }: { week: number | null; total?: number }) {
  if (!week) return <span className="text-muted-foreground">—</span>;
  const done = week > total;
  const value = Math.min(week, total);
  return (
    <span className="flex min-w-28 items-center gap-2" title={done ? "Study period finished" : `Week ${week} of ${total}`}>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", done ? "bg-muted-foreground/40" : "bg-primary")} style={{ width: `${(value / total) * 100}%` }} />
      </span>
      <span className="text-sm whitespace-nowrap tabular-nums">{done ? "Done" : `Wk ${week}`}</span>
    </span>
  );
}

/**
 * A confirmation step for actions with consequences. `onConfirm` may be
 * async; the dialog stays open with a spinner until it settles.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<boolean | void>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                const keepOpen = (await onConfirm()) === false;
                if (!keepOpen) setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? <Spinner /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "warning";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {icon ? <span className={cn("[&_svg]:size-4", tone === "warning" ? "text-destructive" : "text-muted-foreground/70")}>{icon}</span> : null}
      </div>
      <div className="mt-2 font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </>
  );
  const className = "block rounded-2xl border bg-card p-4 shadow-soft transition-colors";
  return href ? (
    <Link href={href} className={cn(className, "hover:border-primary/30 hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
