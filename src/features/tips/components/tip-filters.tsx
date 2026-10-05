"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

type TagFacet = { id: string; name: string; slug: string; count: number };

/** Builds `/tips/explore?tags=a,b&for=you` (the old `/thrive-tips/tags/a+b`). */
export function exploreHref(tags: string[], forYou: boolean) {
  const params = new URLSearchParams();
  if (tags.length) params.set("tags", tags.join(","));
  if (forYou) params.set("for", "you");
  const query = params.toString().replace(/%2C/g, ",");
  return query ? `/tips/explore?${query}` : "/tips/explore";
}

/**
 * Multi-select topic pills + "Picked for you". Selection is kept in the URL so
 * it can be shared and survives reloads; pills respond instantly while the
 * results refresh underneath.
 */
export function TipFilters({
  tags,
  selected,
  forYou,
  recommendedCount,
  resultCount,
  children,
}: {
  tags: TagFacet[];
  selected: string[];
  forYou: boolean;
  recommendedCount: number;
  resultCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useOptimistic({ selected, forYou });

  function apply(next: { selected: string[]; forYou: boolean }) {
    startTransition(() => {
      setState(next);
      router.replace(exploreHref(next.selected, next.forYou), { scroll: false });
    });
  }

  function toggleTag(slug: string) {
    const has = state.selected.includes(slug);
    apply({ ...state, selected: has ? state.selected.filter((s) => s !== slug) : [...state.selected, slug] });
  }

  const active = state.selected.length > 0 || state.forYou;
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED = 10;
  // Most-used topics first when collapsed; selected ones always stay visible.
  const popular = new Set([...tags].sort((a, b) => b.count - a.count).slice(0, COLLAPSED).map((t) => t.slug));
  const visible = expanded ? tags : tags.filter((t) => popular.has(t.slug) || state.selected.includes(t.slug));
  const hidden = tags.length - visible.length;

  return (
    <div>
      <div className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Explore tips</h2>
            <p className="text-sm text-muted-foreground">Pick the topics you want to see. Choose as many as you like.</p>
          </div>
          {active ? (
            <button
              type="button"
              onClick={() => apply({ selected: [], forYou: false })}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" /> Clear
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {recommendedCount > 0 ? (
            <button
              type="button"
              aria-pressed={state.forYou}
              onClick={() => apply({ ...state, forYou: !state.forYou })}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                state.forYou
                  ? "border-transparent bg-gradient-to-r from-brand-apricot to-brand-pink text-[oklch(0.25_0.06_20)]"
                  : "border-brand-apricot/60 bg-brand-apricot/10 hover:bg-brand-apricot/20",
              )}
            >
              <Sparkles className="size-4" aria-hidden /> Picked for you
              <span className="text-xs opacity-70 tabular-nums">{recommendedCount}</span>
            </button>
          ) : null}
          {visible.map((tag) => {
            const on = state.selected.includes(tag.slug);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(tag.slug)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97]",
                  on
                    ? "border-primary bg-primary text-primary-foreground shadow-soft"
                    : "border-border bg-background hover:border-primary/40 hover:text-primary",
                )}
              >
                {on ? <Check className="size-3.5" aria-hidden /> : null}
                {tag.name}
                <span className={cn("text-xs tabular-nums", on ? "opacity-80" : "text-muted-foreground")}>{tag.count}</span>
              </button>
            );
          })}
          {hidden > 0 || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary transition hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {expanded ? "Fewer topics" : `All topics (${tags.length})`}
              <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-6 mb-3 text-sm text-muted-foreground" aria-live="polite">
        {pending ? "Updating…" : active ? `${resultCount} ${resultCount === 1 ? "tip matches" : "tips match"}` : `All your tips · ${resultCount}`}
      </p>
      <div className={cn("transition-opacity duration-200", pending && "opacity-50")} aria-busy={pending}>
        {children}
      </div>
    </div>
  );
}
