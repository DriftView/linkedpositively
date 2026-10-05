import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Friendly empty state used across the tips pages. */
export function TipsEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <Empty className="rounded-2xl border bg-card/60 py-12 shadow-soft">
      <EmptyHeader>
        <EmptyMedia>
          <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
            <Icon className="size-7" aria-hidden />
          </span>
        </EmptyMedia>
        <EmptyTitle className="font-heading text-lg">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent>
          <Link
            href={action.href}
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85"
          >
            {action.label}
          </Link>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
