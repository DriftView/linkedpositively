"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatNumber } from "../format";
import type { CellValue, ReportColumn, ReportRow } from "../types";
import { Cell, heatStyle, isNumeric } from "./cells";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const PAGE_SIZES = [25, 50, 100, 250];

/** Sort key of a cell: nulls become undefined so they always sort last. */
function sortValue(value: CellValue) {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function compare(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

function matches(row: ReportRow, keys: string[], needle: string) {
  return keys.some((key) => {
    const value = row[key];
    if (Array.isArray(value)) return value.some((item) => item.toLowerCase().includes(needle));
    return value !== null && value !== undefined && String(value).toLowerCase().includes(needle);
  });
}

/**
 * The sortable, paginated table every tabular report uses. Rows arrive
 * already computed on the server; sorting, the quick filter and paging are
 * client-side (report populations are at most a few thousand rows).
 */
export function ReportTable({
  columns,
  rows,
  searchKeys = [],
  initialSort,
  noun = "rows",
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  searchKeys?: string[];
  initialSort?: { id: string; desc: boolean };
  noun?: string;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : []);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const data = useMemo(() => (deferred && searchKeys.length ? rows.filter((row) => matches(row, searchKeys, deferred)) : rows), [rows, searchKeys, deferred]);

  const maxOf = useMemo(() => {
    const max: Record<string, number> = {};
    for (const column of columns) {
      if (column.kind !== "heat") continue;
      max[column.id] = rows.reduce((m, row) => (typeof row[column.id] === "number" ? Math.max(m, row[column.id] as number) : m), 0);
    }
    return max;
  }, [columns, rows]);

  const tableColumns = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorFn: (row: ReportRow) => sortValue(row[column.id]),
        header: column.short ?? column.label,
        sortUndefined: "last" as const,
        sortDescFirst: isNumeric(column.kind) || column.kind === "datetime" || column.kind === "date",
        sortFn: (a: { getValue: (id: string) => unknown }, b: { getValue: (id: string) => unknown }, id: string) => compare(a.getValue(id), b.getValue(id)),
      })),
    [columns],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data,
    getRowId: (row: ReportRow) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    enableSortingRemoval: false,
    autoResetPageIndex: true,
  });

  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const pageRows = table.getRowModel().rows;
  const total = data.length;
  const first = total ? pagination.pageIndex * pagination.pageSize + 1 : 0;
  const last = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize);
  const pages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const wide = columns.length > 10;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        {searchKeys.length ? (
          <label className="relative w-full max-w-xs">
            <span className="sr-only">Filter the rows below</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              placeholder="Filter rows…"
              className="h-9 pl-8"
            />
          </label>
        ) : (
          <span />
        )}
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {total === rows.length ? `${formatNumber(total)} ${noun}` : `${formatNumber(total)} of ${formatNumber(rows.length)} ${noun}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", wide && "text-[0.8rem]")}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                {group.headers.map((header) => {
                  const column = byId.get(header.column.id)!;
                  const sorted = header.column.getIsSorted();
                  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "px-3 py-2 align-bottom font-medium whitespace-nowrap first:pl-4",
                        isNumeric(column.kind) && "text-right",
                        column.sticky && "sticky left-0 z-10 bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        title={column.hint ? `${column.label} — ${column.hint}` : column.label}
                        className={cn(
                          "group/sort inline-flex max-w-44 items-center gap-1 rounded-md py-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                          isNumeric(column.kind) && "flex-row-reverse",
                          sorted && "text-foreground",
                        )}
                      >
                        <span className="truncate">{column.short ?? column.label}</span>
                        <Icon className={cn("size-3 shrink-0", !sorted && "opacity-0 group-hover/sort:opacity-60")} aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {pageRows.map((row) => (
              <tr key={row.id} className="group/row hover:bg-muted/30">
                {columns.map((column) => {
                  const value = row.original[column.id];
                  return (
                    <td
                      key={column.id}
                      style={column.kind === "heat" && typeof value === "number" ? heatStyle(value, maxOf[column.id]) : undefined}
                      className={cn(
                        "px-3 py-2 align-top first:pl-4 tabular-nums",
                        wide ? "py-1.5" : "py-2.5",
                        isNumeric(column.kind) && "text-right",
                        column.sticky && "sticky left-0 z-10 bg-card group-hover/row:bg-[color-mix(in_oklch,var(--muted)_30%,var(--card))]",
                      )}
                    >
                      <Cell kind={column.kind} value={value} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {total === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing matches “{query}”. Try part of a study ID.</p> : null}
      </div>

      {total > PAGE_SIZES[0] ? (
        <nav aria-label="Table pages" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="tabular-nums">
              {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
            </span>
            <Select value={String(pagination.pageSize)} onValueChange={(value) => setPagination({ pageIndex: 0, pageSize: Number(value) })}>
              <SelectTrigger size="sm" className="w-auto" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">
              Page {pagination.pageIndex + 1} of {pages}
            </span>
            <Button variant="outline" size="icon-lg" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="outline" size="icon-lg" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
