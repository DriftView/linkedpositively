import Link from "next/link";
import { Info, MapPinned, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { SearchParams } from "../schemas";
import type { SearchResultDTO } from "../types";
import { ResourceCard } from "./resource-card";

function summary(result: SearchResultDTO) {
  const places = `${result.total} ${result.total === 1 ? "place" : "places"}`;
  if (result.mode === "distance" && result.center && !result.notice) {
    return (
      <>
        <strong className="font-semibold text-foreground">{places}</strong> within {result.radius} miles of{" "}
        <strong className="font-semibold text-foreground">{result.center.label}</strong>
      </>
    );
  }
  if (result.mode === "all") return <><strong className="font-semibold text-foreground">{places}</strong> in the directory</>;
  return <><strong className="font-semibold text-foreground">{places}</strong> match your search</>;
}

function withPage(params: SearchParams, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && key !== "page") search.set(key, String(value));
  search.set("page", String(page));
  return `/resources?${search.toString()}`;
}

/** Search results: summary, fallback notice, cards and "Show more". */
export function ResourceResults({ result, params }: { result: SearchResultDTO; params: SearchParams }) {
  const filtered = Boolean(params.q || params.tags || params.loc || params.near);

  if (!result.results.length) {
    return (
      <Empty className="rounded-3xl border border-dashed bg-muted/30 py-12">
        <EmptyHeader>
          <EmptyMedia className="size-14 rounded-2xl bg-secondary text-primary">
            {filtered ? <SearchX className="size-6" /> : <MapPinned className="size-6" />}
          </EmptyMedia>
          <EmptyTitle className="text-lg">{filtered ? "No places match that search" : "The directory is being filled in"}</EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try fewer topics, a wider distance or different words. If you know a place that should be here, tell us about it."
              : "Our team is adding local services. Know a helpful place? Suggest it and we'll add it."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          {filtered ? (
            <Button asChild variant="outline" className="h-10 rounded-full px-4">
              <Link href="/resources">Clear search</Link>
            </Button>
          ) : null}
          <Button asChild className="h-10 rounded-full px-4">
            <Link href="/resources/suggest">
              <Plus aria-hidden />
              Suggest a place
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section aria-label="Results">
      <p aria-live="polite" className="mb-3 px-1 text-sm text-muted-foreground">
        {summary(result)}
      </p>
      {result.notice ? (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-brand-sky/15 px-4 py-3 text-sm text-foreground/85 dark:bg-brand-sky/10">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-sky" />
          {result.notice}
        </p>
      ) : null}
      <ol className="grid grid-cols-1 gap-3">
        {result.results.map((resource, index) => (
          <li key={resource.id}>
            <ResourceCard resource={resource} index={index % 20} />
          </li>
        ))}
      </ol>
      {result.hasMore ? (
        <div className="mt-5 flex justify-center">
          <Button asChild variant="outline" className="h-11 rounded-full px-6 font-semibold">
            <Link href={withPage(params, (params.page ?? 1) + 1)} scroll={false} replace>
              Show more places
            </Link>
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Know a place that isn&apos;t listed?{" "}
          <Link href="/resources/suggest" className="font-semibold text-primary hover:underline">
            Suggest it
          </Link>
        </p>
      )}
    </section>
  );
}
