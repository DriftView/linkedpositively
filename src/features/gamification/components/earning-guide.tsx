import { POINT_RULES, type PointReason } from "../points";
import { EARNING_GUIDE } from "../point-labels";
import { ReasonIcon } from "./reason-icon";

/** "How to earn points": every live point rule, grouped, with its value. */
export function EarningGuide() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {EARNING_GUIDE.map((group) => (
        <section key={group.title} className="rounded-2xl border bg-card p-4 shadow-soft">
          <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h3>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.reason} className="flex items-center gap-3 py-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                  <ReasonIcon reason={item.reason} className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug">
                  {item.label}
                  {item.note ? <span className="text-muted-foreground"> · {item.note}</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-brand-magenta/10 px-2 py-0.5 text-xs font-bold text-brand-magenta tabular-nums dark:bg-brand-magenta/20">
                  +{POINT_RULES[item.reason as PointReason]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
