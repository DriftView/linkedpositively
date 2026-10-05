"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { actionError } from "@/features/resources/client";
import { deleteJourneyItemAction, reorderJourneyAction, saveJourneyItemAction } from "../../admin-actions";
import type { MethodDTO } from "../../queries";

type Kind = "method" | "goal";

/** Methods ("I want to…") of one area, each with its goal ideas. Inline editing. */
export function MethodEditor({ categoryId, methods }: { categoryId: string; methods: MethodDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, success?: string) {
    startTransition(async () => {
      const result = (await fn()) as { serverError?: string } | undefined;
      const error = actionError(result);
      if (error) toast.error(error);
      else {
        if (success) toast.success(success);
        router.refresh();
      }
    });
  }

  const save = (kind: Kind, parentId: string, name: string, id?: string) => run(() => saveJourneyItemAction({ kind, parentId, name, id }));
  const remove = (kind: Kind, id: string) => run(() => deleteJourneyItemAction({ kind, id }), kind === "method" ? "Method deleted" : "Goal idea deleted");
  const reorder = (kind: Kind, ids: string[], index: number, delta: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    run(() => reorderJourneyAction({ kind, ids: next }));
  };

  return (
    <div className="grid gap-4">
      {methods.map((method, index) => (
        <section key={method.id} className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
            <span className="text-sm text-muted-foreground">I want to</span>
            <EditableText
              value={method.name}
              label="method"
              onSave={(name) => save("method", categoryId, name, method.id)}
              onDelete={() => remove("method", method.id)}
              deleteLabel={`Delete this method and its ${method.goals.length} goal ideas?`}
              bold
            />
            <Button variant="ghost" size="icon-sm" aria-label="Move method up" disabled={index === 0 || pending} onClick={() => reorder("method", methods.map((m) => m.id), index, -1)}>
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move method down"
              disabled={index === methods.length - 1 || pending}
              onClick={() => reorder("method", methods.map((m) => m.id), index, 1)}
            >
              <ArrowDown />
            </Button>
          </div>
          <ul className="divide-y">
            {method.goals.map((goal, goalIndex) => (
              <li key={goal.id} className="flex items-center gap-2 px-4 py-2">
                <EditableText value={goal.name} label="goal idea" onSave={(name) => save("goal", method.id, name, goal.id)} onDelete={() => remove("goal", goal.id)} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move goal up"
                  disabled={goalIndex === 0 || pending}
                  onClick={() => reorder("goal", method.goals.map((g) => g.id), goalIndex, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move goal down"
                  disabled={goalIndex === method.goals.length - 1 || pending}
                  onClick={() => reorder("goal", method.goals.map((g) => g.id), goalIndex, 1)}
                >
                  <ArrowDown />
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t px-4 py-2.5">
            <AddInline placeholder="Add a goal idea…" onAdd={(name) => save("goal", method.id, name)} />
          </div>
        </section>
      ))}
      <div className="rounded-xl border border-dashed p-4">
        <AddInline placeholder="Add a method, e.g. “Feel calmer day to day”" onAdd={(name) => save("method", categoryId, name)} button="Add method" />
      </div>
      {pending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> Saving…
        </p>
      ) : null}
    </div>
  );
}

function EditableText({
  value,
  label,
  onSave,
  onDelete,
  deleteLabel,
  bold,
}: {
  value: string;
  label: string;
  onSave: (value: string) => void;
  onDelete: () => void;
  deleteLabel?: string;
  bold?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
          setEditing(false);
        }}
      >
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={300} autoFocus aria-label={`Edit ${label}`} className="h-8" />
        <Button type="submit" size="icon-sm" aria-label="Save">
          <Check />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  }
  return (
    <div className="group flex min-w-0 flex-1 items-center gap-1">
      <span className={bold ? "font-medium" : "text-sm"}>{value}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Rename ${label}`}
        className="opacity-60 group-hover:opacity-100"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${label}`}
        className="opacity-60 group-hover:opacity-100"
        onClick={() => {
          if (window.confirm(deleteLabel ?? `Delete this ${label}?`)) onDelete();
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function AddInline({ placeholder, onAdd, button = "Add" }: { placeholder: string; onAdd: (value: string) => void; button?: string }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim().length < 2) return;
        onAdd(value.trim());
        setValue("");
      }}
    >
      <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} maxLength={300} aria-label={placeholder} className="h-8" />
      <Button type="submit" size="sm" variant="secondary" disabled={value.trim().length < 2}>
        <Plus /> {button}
      </Button>
    </form>
  );
}
