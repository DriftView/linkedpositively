import { cn } from "@/lib/utils";

/** A settings card: title + helper text on top, content below. */
export function SettingsSection({
  id,
  icon,
  title,
  description,
  children,
  className,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 rounded-2xl border bg-card p-5 shadow-soft sm:p-6", className)}>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary [&_svg]:size-4.5">{icon}</span>
        <div>
          <h2 id={`${id}-title`} className="text-lg leading-tight font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
