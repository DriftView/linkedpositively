"use client";

import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kbd } from "@/components/ui/kbd";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const adminTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime, text: sortFn_text, basic: sortFn_basic },
  rowSelectionFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
export type AdminFeatures = typeof adminTableFeatures;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminColumn<T extends object> = ColumnDef<AdminFeatures, T, any>;

type Props<T extends { id: string }> = {
  data: T[];
  columns: AdminColumn<T>[];
  /** Free-text search: return the text a row should be matched against. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Filter controls shown next to the search box. */
  toolbar?: React.ReactNode;
  /** Rendered in the floating bar when rows are selected. */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  selectable?: boolean;
  initialSorting?: SortingState;
  pageSize?: number;
  empty: React.ReactNode;
  /** Noun for counts, e.g. ["person", "people"]. */
  noun?: [string, string];
  columnClassNames?: Record<string, string>;
  rowClassName?: (row: T) => string | undefined;
  /** Focus the search box with "/" (only one table per page should). */
  hotkey?: boolean;
};

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchText,
  searchPlaceholder = "Search",
  toolbar,
  bulkActions,
  selectable = Boolean(bulkActions),
  initialSorting = [],
  pageSize = 25,
  empty,
  noun = ["row", "rows"],
  columnClassNames = {},
  rowClassName,
  hotkey = true,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !searchText) return data;
    const terms = needle.split(/\s+/);
    return data.filter((row) => {
      const haystack = searchText(row).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [data, query, searchText]);

  const allColumns = useMemo<AdminColumn<T>[]>(() => {
    if (!selectable) return columns;
    const select: AdminColumn<T> = {
      id: "select",
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all on this page"
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onClick={(event) => {
            event.stopPropagation();
            row.getToggleSelectedHandler()(event);
          }}
        />
      ),
    };
    return [select, ...columns];
  }, [columns, selectable]);

  const table = useTable({
    features: adminTableFeatures,
    columns: allColumns,
    data: filtered,
    getRowId: (row: T) => row.id,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageIndex: 0, pageSize } },
    autoResetPageIndex: true,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const selected = useMemo(() => {
    const ids = new Set(selectedIds);
    return data.filter((row) => ids.has(row.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rowSelection]);
  const clear = () => setRowSelection({});

  useEffect(() => {
    if (!hotkey) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
      }
      if (event.key === "Escape" && !typing) setRowSelection({});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  const rows = table.getRowModel().rows;
  const { pageIndex, pageSize: size } = table.state.pagination;
  const total = filtered.length;
  const from = total === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min(total, (pageIndex + 1) * size);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchText ? (
          <InputGroup className="h-9 w-full max-w-xs bg-card">
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            <InputGroupAddon align="inline-end">
              {query ? (
                <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
                  <X />
                </InputGroupButton>
              ) : hotkey ? (
                <Kbd>/</Kbd>
              ) : null}
            </InputGroupAddon>
          </InputGroup>
        ) : null}
        {toolbar}
        <p className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {total === data.length ? `${total} ${total === 1 ? noun[0] : noun[1]}` : `${total} of ${data.length} ${noun[1]}`}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="relative w-full overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-muted/40">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b">
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        className={cn(
                          "h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4",
                          header.column.id === "select" && "w-10",
                          columnClassNames[header.column.id],
                        )}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <table.FlexRender header={header} />
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
                            )}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                      "border-b transition-colors last:border-0 hover:bg-muted/40 data-[state=selected]:bg-secondary/60",
                      rowClassName?.(row.original),
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn("px-3 py-2.5 align-middle first:pl-4 last:pr-4", columnClassNames[cell.column.id])}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={allColumns.length} className="p-0">
                    {query && data.length ? (
                      <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <p className="font-medium">Nothing matches “{query}”</p>
                        <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                          Clear search
                        </Button>
                      </div>
                    ) : (
                      empty
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > size ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
            <p className="text-muted-foreground tabular-nums">
              {from}–{to} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Select value={String(size)} onValueChange={(value) => table.setPageSize(Number(value))}>
                <SelectTrigger size="sm" className="w-[7.5rem]" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {bulkActions && selected.length ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full animate-rise flex-wrap items-center gap-2 rounded-2xl border bg-popover/95 px-3 py-2 shadow-lift backdrop-blur"
        >
          <span className="px-1 text-sm font-medium tabular-nums">
            {selected.length} selected
          </span>
          <span className="h-5 w-px bg-border" aria-hidden />
          {bulkActions(selected, clear)}
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear <Kbd className="ml-1">Esc</Kbd>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Small sortable header label. */
export function SortHeader({ children }: { children: React.ReactNode }) {
  return <span>{children}</span>;
}
