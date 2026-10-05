"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { RichTextEditor } from "@/features/pages/components/rich-text-editor";
import { actionError } from "@/features/resources/client";
import { deleteGlossaryTermAction, saveGlossaryTermAction } from "../actions";
import type { GlossaryTermDTO } from "../queries";

type Editing = { id?: string; name: string; definitionHtml: string } | null;

/** Staff CRUD for glossary terms (Drupal taxonomy UI for `glossary_terms`). */
export function GlossaryManager({ terms }: { terms: GlossaryTermDTO[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<GlossaryTermDTO | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? terms.filter((term) => term.name.toLowerCase().includes(q) || term.definitionText.toLowerCase().includes(q)) : terms;
  }, [terms, query]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    startTransition(async () => {
      const result = await saveGlossaryTermAction(editing);
      const error = actionError(result);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(editing.id ? "Term updated" : "Term added");
      setEditing(null);
      router.refresh();
    });
  }

  function remove(term: GlossaryTermDTO) {
    startTransition(async () => {
      const result = await deleteGlossaryTermAction({ id: term.id });
      const error = actionError(result);
      if (error) toast.error(error);
      else {
        toast.success(`Deleted “${term.name}”`);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search terms</span>
          <Search aria-hidden className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${terms.length} terms`} className="pl-8" />
        </label>
        <Button className="ml-auto" onClick={() => setEditing({ name: "", definitionHtml: "" })}>
          <Plus /> New term
        </Button>
      </div>

      {filtered.length ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {filtered.map((term) => (
            <li key={term.id} className="group flex gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary font-heading font-semibold text-primary">{term.letter}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{term.name}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{term.definitionText}</p>
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${term.name}`} onClick={() => setEditing({ id: term.id, name: term.name, definitionHtml: term.definitionHtml })}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${term.name}`} onClick={() => setDeleting(term)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>{terms.length ? "No terms match" : "The glossary is empty"}</EmptyTitle>
            <EmptyDescription>{terms.length ? "Try another word." : "Add the words members might not know, with a plain-language definition."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          {editing ? (
            <form onSubmit={save}>
              <DialogHeader>
                <DialogTitle>{editing.id ? "Edit term" : "New term"}</DialogTitle>
                <DialogDescription>Write the definition in plain, everyday language.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="term-name">Term</Label>
                  <Input id="term-name" value={editing.name} maxLength={120} required autoFocus onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="term-definition">Definition</Label>
                  <RichTextEditor
                    key={editing.id ?? "new"}
                    id="term-definition"
                    ariaLabel="Definition"
                    minimal
                    value={editing.definitionHtml}
                    onChange={(definitionHtml) => setEditing((current) => (current ? { ...current, definitionHtml } : current))}
                    placeholder="What does it mean?"
                  />
                </div>
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !editing.name.trim()}>
                  {pending ? <Spinner /> : null}
                  {editing.id ? "Save" : "Add term"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It will disappear from the glossary. Links to it will go to the top of the glossary.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleting) remove(deleting);
                setDeleting(null);
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
