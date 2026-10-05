"use client";

import { Check, GitMerge, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteTipTag, mergeTipTags, saveTipTag } from "../../admin-actions";
import type { AdminTagOption } from "../../admin-queries";

type Kind = "tag" | "category";

/** Create, rename, delete and merge tip topics and categories. */
export function TopicsManager({ items }: { items: AdminTagOption[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TermList kind="tag" title="Topics" description="Shown as # pills on tips and used to explore." items={items.filter((i) => i.kind === "tag")} />
      <TermList
        kind="category"
        title="Categories"
        description="IMB categories, used to group and relate tips."
        items={items.filter((i) => i.kind === "category")}
      />
    </div>
  );
}

function TermList({ kind, title, description, items }: { kind: Kind; title: string; description: string; items: AdminTagOption[] }) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<AdminTagOption | null>(null);
  const [merging, setMerging] = useState<AdminTagOption | null>(null);
  const [target, setTarget] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const noun = kind === "tag" ? "topic" : "category";

  function run<T>(fn: () => Promise<{ serverError?: string; data?: T } | undefined>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (result?.serverError) return void toast.error(result.serverError);
      toast.success(success);
      after?.();
    });
  }

  const shown = items.filter((i) => i.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="border-b p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim().length < 2) return;
            run(() => saveTipTag({ kind, name: adding.trim() }), `Added “${adding.trim()}”`, () => setAdding(""));
          }}
        >
          <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`New ${noun}`} aria-label={`New ${noun} name`} maxLength={120} />
          <Button type="submit" disabled={pending || adding.trim().length < 2}>
            <Plus /> Add
          </Button>
        </form>
        {items.length > 12 ? (
          <Input className="mt-2" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${title.toLowerCase()}`} aria-label={`Filter ${title.toLowerCase()}`} />
        ) : null}
      </header>
      <ul className="max-h-[32rem] divide-y overflow-y-auto">
        {shown.map((item) => (
          <li key={item.id} className="group flex min-h-12 items-center gap-2 px-4 py-2">
            {editing === item.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => saveTipTag({ id: item.id, kind, name: draft.trim() }), "Renamed", () => setEditing(null));
                }}
              >
                <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Rename ${item.name}`} maxLength={120} />
                <Button type="submit" size="icon" aria-label="Save name" disabled={pending || draft.trim().length < 2}>
                  <Check />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X />
                </Button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm">{item.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums" title="Tips using it">
                  {item.count} {item.count === 1 ? "tip" : "tips"}
                </span>
                <div className="flex opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Rename ${item.name}`}
                    onClick={() => {
                      setEditing(item.id);
                      setDraft(item.name);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Merge ${item.name} into another ${noun}`}
                    onClick={() => {
                      setMerging(item);
                      setTarget("");
                    }}
                  >
                    <GitMerge />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => setRemoving(item)}>
                    <Trash2 />
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
        {!shown.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here yet.</li> : null}
      </ul>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.count
                ? `It will be removed from ${removing.count} ${removing.count === 1 ? "tip" : "tips"}. To keep those tips grouped, merge it into another ${noun} instead.`
                : `No tips use this ${noun}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removing && run(() => deleteTipTag({ id: removing.id }), `Deleted “${removing.name}”`, () => setRemoving(null))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(merging)} onOpenChange={(open) => !open && setMerging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge “{merging?.name}”</DialogTitle>
            <DialogDescription>
              Its {merging?.count ?? 0} {merging?.count === 1 ? "tip moves" : "tips move"} to the {noun} you choose, then “{merging?.name}” is deleted.
            </DialogDescription>
          </DialogHeader>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full" aria-label={`Merge into ${noun}`}>
              <SelectValue placeholder={`Choose a ${noun}`} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {items
                .filter((i) => i.id !== merging?.id)
                .map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>
              Cancel
            </Button>
            <Button
              disabled={!target || pending}
              onClick={() => merging && run(() => mergeTipTags({ sourceId: merging.id, targetId: target }), "Merged", () => setMerging(null))}
            >
              <GitMerge /> Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
