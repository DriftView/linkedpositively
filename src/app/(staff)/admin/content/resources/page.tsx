import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileUp, Inbox, MapPinOff, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ResourcesTable } from "@/features/resources/components/admin/resources-table";
import { adminListResources, adminResourceCounts, type AdminTab } from "@/features/resources/queries";
import { geocodingEnabled } from "@/features/resources/geocode";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Resources" };

const TABS: { id: AdminTab; label: string; empty: string }[] = [
  { id: "published", label: "Published", empty: "No published resources match." },
  { id: "suggested", label: "Suggested", empty: "No suggestions waiting. New ones from members show up here." },
  { id: "reported", label: "Reported", empty: "Nothing reported. Members' reports about closed or wrong listings show up here." },
  { id: "unpublished", label: "Unpublished", empty: "No hidden resources." },
];

export default async function AdminResourcesPage(props: PageProps<"/admin/content/resources">) {
  await requirePermission("resources.manage");
  const params = await props.searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = (TABS.find((item) => item.id === one(params.tab))?.id ?? "published") as AdminTab;
  const q = one(params.q)?.slice(0, 100) ?? "";
  const page = Number(one(params.page)) || 1;
  const [counts, list] = await Promise.all([adminResourceCounts(), adminListResources({ tab, q, page })]);
  const href = (changes: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    const merged = { tab, q: q || undefined, page: undefined as number | undefined, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value && !(key === "tab" && value === "published")) search.set(key, String(value));
    const query = search.toString();
    return `/admin/content/resources${query ? `?${query}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Resources"
        description="The resource locator's directory: review member suggestions and reports, edit listings, import from CSV."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/api/resources/export" download>
                <Download /> Export CSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/content/resources/import">
                <FileUp /> Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/content/resources/new">
                <Plus /> New resource
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Resource status" className="inline-flex rounded-lg bg-muted p-1">
          {TABS.map((item) => {
            const count = counts[item.id];
            const attention = (item.id === "suggested" || item.id === "reported") && count > 0;
            return (
              <Link
                key={item.id}
                href={href({ tab: item.id, q: undefined })}
                aria-current={tab === item.id ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  tab === item.id && "bg-card text-foreground shadow-soft",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    attention ? "bg-brand-magenta text-white" : "bg-background/70 text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>
        <form className="ml-auto flex w-full max-w-xs items-center gap-2 sm:w-auto" action="/admin/content/resources">
          {tab !== "published" ? <input type="hidden" name="tab" value={tab} /> : null}
          <label className="relative flex-1">
            <span className="sr-only">Search resources</span>
            <Search aria-hidden className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Name, city or ZIP" className="pl-8" />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {tab === "published" && counts.pendingGeocode ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <MapPinOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {counts.pendingGeocode} published {counts.pendingGeocode === 1 ? "resource isn't" : "resources aren't"} on the map yet, so{" "}
            {counts.pendingGeocode === 1 ? "it won't" : "they won't"} show up in distance searches.{" "}
            {geocodingEnabled()
              ? "They're geocoded automatically overnight, or open one and save it to retry."
              : "Geocoding isn't set up (GOOGLE_MAPS_API_KEY), so add coordinates by hand in each resource."}
          </span>
        </p>
      ) : null}

      {list.rows.length ? (
        <>
          <ResourcesTable rows={list.rows} tab={tab} />
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {list.total} {list.total === 1 ? "resource" : "resources"}
              {q ? ` matching “${q}”` : ""}
            </span>
            {list.pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild disabled={page <= 1}>
                  <Link href={href({ page: Math.max(1, page - 1) })} aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
                    <ChevronLeft /> Previous
                  </Link>
                </Button>
                <span className="tabular-nums">
                  Page {list.page} of {list.pageCount}
                </span>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={href({ page: Math.min(list.pageCount, page + 1) })}
                    aria-disabled={page >= list.pageCount}
                    className={cn(page >= list.pageCount && "pointer-events-none opacity-50")}
                  >
                    Next <ChevronRight />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>{q ? "No matches" : "All clear"}</EmptyTitle>
            <EmptyDescription>{q ? `Nothing matches “${q}” here.` : TABS.find((item) => item.id === tab)?.empty}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
