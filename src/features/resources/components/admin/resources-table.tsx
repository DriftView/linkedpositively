"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  MapPin,
  MapPinOff,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { deleteResourcesAction, dismissReportsAction, setResourceStatusAction } from "../../admin-actions";
import { actionError } from "../../client";
import type { AdminResourceRowDTO } from "../../types";

type Tab = "published" | "suggested" | "reported" | "unpublished";

/** Staff list of resources with selection and bulk publish / unpublish / delete. */
export function ResourcesTable({ rows, tab }: { rows: AdminResourceRowDTO[]; tab: Tab }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function run(label: string, fn: () => Promise<unknown>) {
    startTransition(async () => {
      const result = (await fn()) as { serverError?: string; validationErrors?: unknown } | undefined;
      const error = actionError(result);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(label);
      setSelected(new Set());
      router.refresh();
    });
  }

  const setStatus = (ids: string[], status: "published" | "unpublished") =>
    run(
      status === "published" ? `Published ${ids.length === 1 ? "resource" : `${ids.length} resources`}` : `Unpublished ${ids.length === 1 ? "resource" : `${ids.length} resources`}`,
      () => setResourceStatusAction({ ids, status }),
    );

  const ids = [...selected];

  return (
    <div className="relative">
      {ids.length ? (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lift">
          <span className="text-sm font-medium">{ids.length} selected</span>
          <span className="mx-1 h-5 w-px bg-border" />
          {tab !== "published" ? (
            <Button size="sm" onClick={() => setStatus(ids, "published")} disabled={pending}>
              <Eye /> Publish
            </Button>
          ) : null}
          {tab !== "unpublished" ? (
            <Button size="sm" variant="outline" onClick={() => setStatus(ids, "unpublished")} disabled={pending}>
              <EyeOff /> Unpublish
            </Button>
          ) : null}
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(ids)} disabled={pending}>
            <Trash2 /> Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          {pending ? <Spinner /> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : selected.size ? "indeterminate" : false}
                  onCheckedChange={(value) => setSelected(value ? new Set(rows.map((row) => row.id)) : new Set())}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden lg:table-cell">Tags</TableHead>
              {tab === "suggested" ? <TableHead>Suggested by</TableHead> : null}
              {tab === "reported" ? <TableHead>Reports</TableHead> : null}
              <TableHead className="hidden text-right sm:table-cell">Rating</TableHead>
              <TableHead className="hidden xl:table-cell">Updated</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label={`Select ${row.title}`} />
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <Link href={`/admin/content/resources/${row.id}`} className="font-medium hover:text-primary hover:underline">
                    {row.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{[row.address, row.contact].filter(Boolean).join(" · ") || "No address or contact"}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    <GeoIcon status={row.geocodeStatus} />
                    <span className="text-sm">{[row.city, row.state].filter(Boolean).join(", ") || "—"}</span>
                    {row.zip ? <span className="text-xs text-muted-foreground tabular-nums">{row.zip}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-56 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {row.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                    {row.tags.length > 2 ? <Badge variant="outline" className="font-normal">+{row.tags.length - 2}</Badge> : null}
                  </div>
                </TableCell>
                {tab === "suggested" ? <TableCell className="text-sm">{row.suggestedByName ?? "Staff"}</TableCell> : null}
                {tab === "reported" ? (
                  <TableCell>
                    <Badge variant="destructive">
                      <Flag /> {row.openReportCount}
                    </Badge>
                  </TableCell>
                ) : null}
                <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
                  {row.ratingCount ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3.5 fill-brand-apricot text-brand-apricot" aria-hidden />
                      {row.ratingAverage.toFixed(1)}
                      <span className="text-muted-foreground">({row.ratingCount})</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                  {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/content/resources/${row.id}`}>
                          <Pencil /> Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/resources/${row.id}`} target="_blank">
                          <Eye /> View as member
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {row.status !== "published" ? (
                        <DropdownMenuItem onSelect={() => setStatus([row.id], "published")}>
                          <CheckCircle2 /> Publish
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setStatus([row.id], "unpublished")}>
                          <EyeOff /> Unpublish
                        </DropdownMenuItem>
                      )}
                      {row.openReportCount ? (
                        <DropdownMenuItem onSelect={() => run("Reports dismissed", () => dismissReportsAction({ resourceId: row.id }))}>
                          <ShieldCheck /> Keep it, dismiss reports
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete([row.id])}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length === 1 ? "this resource" : `${confirmDelete?.length} resources`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This also removes members&apos; saves, ratings and reports for {confirmDelete?.length === 1 ? "it" : "them"}. To hide a resource
              but keep its history, unpublish it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-white hover:bg-destructive/90")}
              onClick={() => {
                const target = confirmDelete ?? [];
                setConfirmDelete(null);
                run(`Deleted ${target.length === 1 ? "resource" : `${target.length} resources`}`, () => deleteResourcesAction({ ids: target }));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GeoIcon({ status }: { status: AdminResourceRowDTO["geocodeStatus"] }) {
  const ok = status === "ok";
  const label =
    status === "ok"
      ? "On the map: shows up in distance searches"
      : status === "pending"
        ? "Waiting to be placed on the map"
        : status === "failed"
          ? "Couldn't find this address on the map"
          : "No address to place on the map";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={label} className="inline-grid">
          {ok ? <MapPin className="size-3.5 text-success" /> : <MapPinOff className={cn("size-3.5", status === "failed" ? "text-destructive" : "text-muted-foreground")} />}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
