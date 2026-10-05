"use client";

import { Check, ChevronDown, LocateFixed, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { DEFAULT_RADIUS, formatNear, RADIUS_OPTIONS, roundCoord } from "../lib";
import type { ResourceTagDTO } from "../types";

const PendingContext = createContext(false);

type Geo = { state: "idle" } | { state: "locating" } | { state: "error"; message: string };

const GEO_ERRORS: Record<number, string> = {
  1: "Location access is off. Enter a city or ZIP code, or allow location for this site in your browser settings.",
  2: "We couldn't find your location right now. Try a city or ZIP code instead.",
  3: "Finding your location took too long. Try again, or enter a ZIP code.",
};

/**
 * The resource locator's search panel: keyword, city/ZIP or device location,
 * distance and topic filters. Everything lives in the URL so results can be
 * shared, refreshed and navigated back to; results below are server-rendered
 * and dim while a new search loads.
 */
export function ResourceLocator({
  tags,
  children,
}: {
  tags: ResourceTagDTO[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [geo, setGeo] = useState<Geo>({ state: "idle" });

  const q = params.get("q") ?? "";
  const loc = params.get("loc") ?? "";
  const near = params.get("near") ?? "";
  const radius = params.get("radius") ?? String(DEFAULT_RADIUS);
  const sort = params.get("sort") ?? "";
  const selected = (params.get("tags") ?? "").split(",").filter(Boolean);

  const [keyword, setKeyword] = useState(q);
  const [place, setPlace] = useState(loc);
  const keywordRef = useRef<HTMLInputElement>(null);

  // Keep inputs in sync with back/forward navigation.
  const [synced, setSynced] = useState({ q, loc });
  if (synced.q !== q || synced.loc !== loc) {
    setSynced({ q, loc });
    setKeyword(q);
    setPlace(loc);
  }

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedPlace = place.trim();
    navigate({ q: keyword.trim() || null, loc: trimmedPlace || null, near: trimmedPlace ? null : near || null });
    keywordRef.current?.blur();
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeo({ state: "error", message: "Your browser can't share your location. Enter a city or ZIP code instead." });
      return;
    }
    setGeo({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({ state: "idle" });
        setPlace("");
        navigate({
          near: formatNear({ lat: roundCoord(position.coords.latitude), lng: roundCoord(position.coords.longitude) }),
          loc: null,
          q: keyword.trim() || null,
        });
      },
      (error) => setGeo({ state: "error", message: GEO_ERRORS[error.code] ?? "Something went wrong finding your location." }),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  }

  function toggleTag(slug: string) {
    const next = selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug];
    navigate({ tags: next.join(",") || null });
  }

  const hasCenter = Boolean(near || loc);
  const topTags = [
    ...tags.filter((tag) => selected.includes(tag.slug)),
    ...tags.filter((tag) => !selected.includes(tag.slug)).slice(0, 10),
  ];

  return (
    <PendingContext.Provider value={pending}>
      <form
        onSubmit={submit}
        role="search"
        aria-label="Find resources"
        className="rounded-3xl border bg-card p-3 shadow-soft sm:p-4"
      >
        <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr]">
          <label className="group flex h-12 items-center gap-2.5 rounded-2xl bg-muted/60 px-3.5 transition-colors focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/40">
            <Search aria-hidden className="size-[1.1rem] shrink-0 text-muted-foreground" />
            <span className="sr-only">What are you looking for?</span>
            <input
              ref={keywordRef}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Testing, PrEP, food, housing…"
              maxLength={100}
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-muted-foreground/80"
            />
            {keyword ? (
              <button
                type="button"
                onClick={() => {
                  setKeyword("");
                  if (q) navigate({ q: null });
                }}
                aria-label="Clear search words"
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </label>

          <div className="flex h-12 items-center gap-2 rounded-2xl bg-muted/60 pr-1.5 pl-3.5 transition-colors focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/40">
            <MapPin aria-hidden className="size-[1.1rem] shrink-0 text-muted-foreground" />
            {near && !place ? (
              <span className="flex min-w-0 flex-1 items-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  <LocateFixed aria-hidden className="size-3.5" />
                  Near you
                  <button
                    type="button"
                    onClick={() => navigate({ near: null })}
                    aria-label="Stop using my location"
                    className="-mr-1 grid size-5 place-items-center rounded-full hover:bg-primary-foreground/20"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </span>
            ) : (
              <label className="flex min-w-0 flex-1">
                <span className="sr-only">City or ZIP code</span>
                <input
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                  placeholder="City or ZIP code"
                  maxLength={120}
                  autoComplete="postal-code"
                  enterKeyHint="search"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-muted-foreground/80"
                />
              </label>
            )}
            <button
              type="button"
              onClick={locate}
              disabled={geo.state === "locating"}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {geo.state === "locating" ? <Spinner className="size-4" /> : <LocateFixed aria-hidden className="size-4" />}
              <span className="hidden min-[400px]:inline">{geo.state === "locating" ? "Locating…" : "Near me"}</span>
              <span className="sr-only min-[400px]:hidden">Use my location</span>
            </button>
          </div>
        </div>

        {geo.state === "error" ? (
          <p role="status" className="mt-2 rounded-xl bg-warning/15 px-3 py-2 text-sm text-foreground/85">
            {geo.message}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Select value={radius} onValueChange={(value) => navigate({ radius: value === String(DEFAULT_RADIUS) ? null : value })}>
            <SelectTrigger
              aria-label="Search distance"
              disabled={!hasCenter}
              className="h-10 rounded-full border-0 bg-muted/60 px-3.5 text-sm font-medium shadow-none data-[size=default]:h-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  Within {option} miles
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort || (hasCenter ? "distance" : "name")} onValueChange={(value) => navigate({ sort: value })}>
            <SelectTrigger aria-label="Sort results" className="h-10 rounded-full border-0 bg-muted/60 px-3.5 text-sm font-medium shadow-none data-[size=default]:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hasCenter ? <SelectItem value="distance">Closest first</SelectItem> : null}
              <SelectItem value="name">A to Z</SelectItem>
              <SelectItem value="rating">Top rated</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" className="ml-auto h-10 rounded-full px-5 text-sm font-semibold" disabled={pending}>
            {pending ? <Spinner /> : <Search aria-hidden />}
            Search
          </Button>
        </div>
      </form>

      {tags.length ? (
        <div className="mt-4">
          <p id="topics-label" className="sr-only">
            Filter by topic
          </p>
          <div
            aria-labelledby="topics-label"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            {topTags.map((tag) => {
              const active = selected.includes(tag.slug);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.slug)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all active:scale-[0.97]",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {active ? <Check aria-hidden className="size-3.5" /> : null}
                  {tag.name}
                </button>
              );
            })}
            <MoreTopics tags={tags} selected={selected} onToggle={toggleTag} />
          </div>
        </div>
      ) : null}

      <div className="mt-5">{children}</div>
    </PendingContext.Provider>
  );
}

function MoreTopics({ tags, selected, onToggle }: { tags: ResourceTagDTO[]; selected: string[]; onToggle: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <SlidersHorizontal aria-hidden className="size-3.5" />
          All topics
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Find a topic…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No topics match.</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => {
                const active = selected.includes(tag.slug);
                return (
                  <CommandItem key={tag.id} value={tag.name} onSelect={() => onToggle(tag.slug)} className="gap-2">
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-[5px] border",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {active ? <Check className="size-3" /> : null}
                    </span>
                    <span className="flex-1 truncate">{tag.name}</span>
                    {tag.count ? <span className="text-xs text-muted-foreground tabular-nums">{tag.count}</span> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Wraps server-rendered results: dims them while a new search is loading. */
export function LocatorResults({ children }: { children: React.ReactNode }) {
  const pending = useContext(PendingContext);
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50")}>
      {children}
    </div>
  );
}
