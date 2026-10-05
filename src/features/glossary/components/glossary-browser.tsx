"use client";

import { Search, SearchX, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { recordGlossaryViewAction } from "../actions";
import { LETTERS } from "../lib";
import type { GlossaryTermDTO } from "../queries";

/**
 * A–Z glossary (old /yt-glossary): instant search, a sticky letter bar with
 * anchors, and a stable #anchor per term so other pages can link to it.
 */
export function GlossaryBrowser({ terms }: { terms: GlossaryTermDTO[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void recordGlossaryViewAction();
  }, []);

  const filtered = useMemo(() => {
    if (!deferred) return terms;
    const byName = terms.filter((term) => term.name.toLowerCase().includes(deferred));
    const byDefinition = terms.filter((term) => !byName.includes(term) && term.definitionText.toLowerCase().includes(deferred));
    return [...byName, ...byDefinition];
  }, [terms, deferred]);

  const groups = useMemo(() => {
    const map = new Map<string, GlossaryTermDTO[]>();
    for (const term of filtered) map.set(term.letter, [...(map.get(term.letter) ?? []), term]);
    return deferred ? [["", filtered] as const] : [...map.entries()];
  }, [filtered, deferred]);

  const present = useMemo(() => new Set(terms.map((term) => term.letter)), [terms]);

  return (
    <div>
      <div className="sticky top-15 z-20 -mx-4 bg-background/85 px-4 pt-1 pb-3 backdrop-blur-xl sm:mx-0 sm:px-0">
        <label className="flex h-12 items-center gap-2.5 rounded-2xl border bg-card px-3.5 shadow-soft transition-shadow focus-within:ring-3 focus-within:ring-ring/40">
          <Search aria-hidden className="size-[1.1rem] text-muted-foreground" />
          <span className="sr-only">Search the glossary</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${terms.length} terms`}
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80"
            enterKeyHint="search"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        {!deferred ? (
          <nav aria-label="Jump to letter" className="mt-2.5 -mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap">
            {LETTERS.map((letter) =>
              present.has(letter) ? (
                <a
                  key={letter}
                  href={`#letter-${letter}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-secondary sm:size-8"
                >
                  {letter}
                </a>
              ) : (
                <span key={letter} aria-hidden className="grid size-9 shrink-0 place-items-center text-sm text-muted-foreground/40 sm:size-8">
                  {letter}
                </span>
              ),
            )}
          </nav>
        ) : (
          <p aria-live="polite" className="mt-2.5 px-1 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "term" : "terms"} match &ldquo;{query.trim()}&rdquo;
          </p>
        )}
      </div>

      {filtered.length ? (
        <div className="mt-2 space-y-8">
          {groups.map(([letter, items]) => (
            <section key={letter || "results"} aria-labelledby={letter ? `letter-${letter}` : undefined}>
              {letter ? (
                <h2
                  id={`letter-${letter}`}
                  className="mb-3 flex scroll-mt-44 items-center gap-3 font-heading text-2xl font-semibold text-primary"
                >
                  {letter}
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </h2>
              ) : null}
              <dl className="grid gap-2.5">
                {items.map((term) => (
                  <div
                    key={term.id}
                    id={term.slug}
                    className="scroll-mt-44 rounded-2xl border bg-card p-4 shadow-soft transition-shadow target:ring-3 target:ring-brand-magenta/40 sm:p-5"
                  >
                    <dt className="font-heading text-lg font-semibold">
                      <a href={`#${term.slug}`} className="hover:text-primary">
                        {highlight(term.name, deferred)}
                      </a>
                    </dt>
                    {/* Sanitized with sanitizeStaffHtml when saved. */}
                    <dd className="prose-content mt-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: term.definitionHtml }} />
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed bg-muted/30 px-6 py-12 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <SearchX className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-heading text-lg font-semibold">{terms.length ? "No terms match that search" : "The glossary is empty for now"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {terms.length ? "Try a shorter word, or browse the letters." : "Terms will appear here once the study team adds them."}
          </p>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className={cn("rounded bg-brand-apricot/40 px-0.5 text-inherit")}>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
