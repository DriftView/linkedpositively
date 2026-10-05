"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Heart, Search, Sparkles, Trash2, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteTips, setTipsPublished } from "../../admin-actions";
import type { AdminTagOption, AdminTipRow } from "../../admin-queries";
import { TipTypeIcon } from "../tip-card";

const TYPE_LABELS: Record<string, string> = { html: "Text", video: "Video", pdf: "PDF", offsite: "Link" };

/** Filterable tips table with bulk publish / unpublish / delete (the old admin/tips-list). */
export function TipsTable({ rows, tags }: { rows: AdminTipRow[]; tags: AdminTagOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [filtering, startFiltering] = useTransition();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    startFiltering(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }
  const onSearch = useDebouncedCallback((value: string) => setParam("q", value.trim() || null), 250);

  const visibleIds = rows.map((r) => r.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allChecked = selectedVisible.length > 0 && selectedVisible.length === visibleIds.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visibleIds) : new Set());
  }
  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bulkPublish(published: boolean) {
    startTransition(async () => {
      const result = await setTipsPublished({ ids: selectedVisible, published });
      if (result?.serverError) return void toast.error(result.serverError);
      toast.success(`${selectedVisible.length} ${selectedVisible.length === 1 ? "tip" : "tips"} ${published ? "published" : "hidden from participants"}`);
      setSelected(new Set());
    });
  }

  function bulkDelete() {
    startTransition(async () => {
      const result = await deleteTips({ ids: selectedVisible });
      if (result?.serverError) return void toast.error(result.serverError);
      toast.success(`Deleted ${result?.data?.deleted ?? 0} ${result?.data?.deleted === 1 ? "tip" : "tips"}`);
      setSelected(new Set());
      setConfirmDelete(false);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            defaultValue={params.get("q") ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search titles"
            aria-label="Search tip titles"
            className="h-9 pl-8"
          />
        </div>
        <Select value={params.get("type") ?? "all"} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger className="h-9 w-32" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.get("tag") ?? "all"} onValueChange={(v) => setParam("tag", v)}>
          <SelectTrigger className="h-9 w-48" aria-label="Topic">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All topics</SelectItem>
            {tags
              .filter((t) => t.kind === "tag")
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={params.get("status") ?? "all"} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className="h-9 w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Hidden</SelectItem>
            <SelectItem value="tailored">Tailored</SelectItem>
            <SelectItem value="unscheduled">Not scheduled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={params.get("sort") ?? "day"} onValueChange={(v) => setParam("sort", v === "day" ? null : v)}>
          <SelectTrigger className="h-9 w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Sort: day (cycle 1)</SelectItem>
            <SelectItem value="day2">Sort: day (cycle 2)</SelectItem>
            <SelectItem value="title">Sort: title</SelectItem>
            <SelectItem value="updated">Sort: last edited</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn(
          "mt-3 flex h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
          selectedVisible.length ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {selectedVisible.length ? (
          <>
            <span className="font-medium">{selectedVisible.length} selected</span>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => bulkPublish(true)}>
                <Eye /> Publish
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => bulkPublish(false)}>
                <EyeOff /> Hide
              </Button>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
          </>
        ) : (
          <span>
            {rows.length} {rows.length === 1 ? "tip" : "tips"}
            {filtering ? " · updating…" : ""}
          </span>
        )}
      </div>

      <div className={cn("mt-1 overflow-x-auto rounded-xl border bg-card transition-opacity", filtering && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Select all tips" />
              </TableHead>
              <TableHead>Tip</TableHead>
              <TableHead className="hidden md:table-cell">Topics</TableHead>
              <TableHead className="text-right">Day 1</TableHead>
              <TableHead className="text-right">Day 2</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                <span className="inline-flex items-center gap-1" title="Participants who read it">
                  <Users className="size-3.5" /> Readers
                </span>
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                <span className="inline-flex items-center gap-1" title="Favourites">
                  <Heart className="size-3.5" /> Favs
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(row.id)} onCheckedChange={(v) => toggle(row.id, v === true)} aria-label={`Select ${row.title}`} />
                  </TableCell>
                  <TableCell className="max-w-md min-w-64 whitespace-normal">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary" title={TYPE_LABELS[row.type]}>
                        <TipTypeIcon type={row.type as "html"} className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/content/tips/${row.id}`} className="font-medium hover:text-primary hover:underline">
                          {row.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {!row.published ? <Badge variant="outline">Hidden</Badge> : null}
                          {row.rule ? (
                            <Badge variant="secondary" className="gap-1">
                              <Sparkles className="size-3" /> {row.rule}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-60 whitespace-normal text-muted-foreground md:table-cell">
                    {row.tags.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.displayDay ?? <span className="text-destructive">—</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.displayDayTwo ?? "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.readers}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.favorites}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No tips match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedVisible.length} {selectedVisible.length === 1 ? "tip" : "tips"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Participants will no longer see {selectedVisible.length === 1 ? "it" : "them"}, and favourites are removed. Reading history stays in the reports.
              If you might want {selectedVisible.length === 1 ? "it" : "them"} back, hide instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                bulkDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
