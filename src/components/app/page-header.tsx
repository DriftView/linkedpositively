import { cn } from "@/lib/utils";

/**
 * Page title with an optional "N new" counter, description and actions.
 * The modern take on the old site's lavender "title block" cards
 * ("Your Wall | 3 New", "Your Tips | 2 New Tips").
 */
export function PageHeader({
  title,
  description,
  count,
  countLabel = "new",
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.65rem] leading-tight font-semibold sm:text-3xl">
          {title}
          {count ? (
            <span className="rounded-full bg-brand-magenta/10 px-2.5 py-0.5 font-sans text-sm font-semibold text-brand-magenta tabular-nums dark:bg-brand-magenta/20">
              {count} {countLabel}
            </span>
          ) : null}
        </h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[0.95rem] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
