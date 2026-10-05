"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** The big search field on /search. Enter searches; the × clears. */
export function SearchBox({ initial = "", autoFocus, className }: { initial?: string; autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const term = value.trim();
    if (!term) return;
    const tag = /^#[\p{L}][\p{L}\p{N}_]+$/u.test(term) ? term.slice(1).toLowerCase() : null;
    router.push(tag ? `/search?tag=${encodeURIComponent(tag)}` : `/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <form role="search" onSubmit={submit} className={cn("relative", className)}>
      <label htmlFor="site-search" className="sr-only">
        Search posts and tips
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id="site-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search posts and tips…"
        autoFocus={autoFocus}
        enterKeyHint="search"
        maxLength={200}
        className="h-13 w-full rounded-2xl border bg-card pr-12 pl-12 text-base shadow-soft outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </form>
  );
}
