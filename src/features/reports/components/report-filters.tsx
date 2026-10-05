"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ARM_LABELS, filtersQuery, PRESETS, presetRange, type Arm, type ReportFilters } from "../filters";

/**
 * Date range, study-ID search and study arm, kept in the URL so the page,
 * its bookmark and its CSV export all show the same thing.
 */
export function ReportFiltersBar({
  filters,
  defaultArm,
  arms,
  dated,
}: {
  filters: ReportFilters;
  defaultArm: Arm;
  arms: Arm[];
  dated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [sid, setSid] = useState(filters.sid ?? "");

  function apply(next: Partial<ReportFilters>) {
    const merged = { ...filters, ...next };
    startTransition(() => router.replace(`${pathname}${filtersQuery(merged, defaultArm)}`, { scroll: false }));
  }

  // Debounced study-ID search.
  useEffect(() => {
    const value = sid.trim();
    if (value === (filters.sid ?? "")) return;
    const timer = setTimeout(() => apply({ sid: value || undefined }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `apply` closes over the current filters on purpose
  }, [sid]);

  const preset = !filters.from && !filters.to ? "all" : (PRESETS.find((p) => p.days && presetMatches(p.days, filters))?.id ?? "");

  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl bg-muted/60 p-3 sm:p-4" aria-busy={pending}>
      {dated ? (
        <>
          <fieldset className="min-w-0">
            <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarRange className="size-3.5" aria-hidden />
              Period
            </legend>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={preset}
              onValueChange={(value) => {
                if (!value) return;
                const entry = PRESETS.find((p) => p.id === value);
                if (!entry) return;
                apply(entry.days ? presetRange(entry.days) : { from: undefined, to: undefined });
              }}
              className="bg-background"
            >
              {PRESETS.map((p) => (
                <ToggleGroupItem key={p.id} value={p.id} className="px-3 text-xs">
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </fieldset>
          <div className="flex items-end gap-2">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              From
              <Input
                type="date"
                value={filters.from ?? ""}
                max={filters.to}
                onChange={(event) => apply({ from: event.target.value || undefined })}
                className="h-8 w-[9.5rem] bg-background text-sm text-foreground"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              To
              <Input
                type="date"
                value={filters.to ?? ""}
                min={filters.from}
                onChange={(event) => apply({ to: event.target.value || undefined })}
                className="h-8 w-[9.5rem] bg-background text-sm text-foreground"
              />
            </label>
          </div>
        </>
      ) : null}

      <label className="grid min-w-0 flex-1 basis-44 gap-1.5 text-xs font-medium text-muted-foreground sm:max-w-60">
        Study ID
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden />
          <Input value={sid} onChange={(event) => setSid(event.target.value)} placeholder="Contains…" className="h-8 bg-background pl-8 text-sm text-foreground" maxLength={60} />
        </span>
      </label>

      {arms.length > 1 ? (
        <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          <span id="report-arm-label">Who</span>
          <Select value={filters.arm} onValueChange={(value) => apply({ arm: value as Arm })}>
            <SelectTrigger size="sm" className="w-40 bg-background text-sm text-foreground" aria-labelledby="report-arm-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {arms.map((arm) => (
                <SelectItem key={arm} value={arm}>
                  {ARM_LABELS[arm]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {pending ? <Spinner className="text-muted-foreground" aria-label="Updating" /> : null}
        {filters.from || filters.to || filters.sid || filters.arm !== defaultArm ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSid("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function presetMatches(days: number, filters: ReportFilters) {
  const range = presetRange(days);
  return range.from === filters.from && range.to === filters.to;
}
