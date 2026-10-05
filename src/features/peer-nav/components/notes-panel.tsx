"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatInZone, friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createNote, deleteNote, restoreNote, updateNote } from "../actions";
import type { ContactMethod } from "../constants";
import { CURRICULUM } from "../curriculum";
import { methodLabel } from "../format";
import type { NoteItem } from "../types";
import { actionError } from "./action-result";
import { AutoTextarea } from "./auto-textarea";
import { EmptyState } from "./bits";
import { MethodIcon, MethodPicker } from "./method-picker";

type Filter = "all" | "general" | number;

/** Contact notes for a participant (legacy Notes tab), with create, edit and delete of your own notes. */
export function NotesPanel({ participantId, notes, timezone }: { participantId: string; notes: NoteItem[]; timezone: string }) {
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const router = useRouter();

  const visible = useMemo(
    () =>
      notes.filter(
        (n) => !hidden.has(n.id) && (filter === "all" || (filter === "general" ? n.sessionSerial === null : n.sessionSerial === filter)),
      ),
    [notes, filter, hidden],
  );
  const serialsWithNotes = [...new Set(notes.map((n) => n.sessionSerial).filter((s): s is number => s !== null))].sort((a, b) => a - b);

  async function remove(note: NoteItem) {
    setHidden((h) => new Set(h).add(note.id));
    const result = await deleteNote({ id: note.id });
    const error = actionError(result);
    if (error) {
      setHidden((h) => {
        const next = new Set(h);
        next.delete(note.id);
        return next;
      });
      toast.error(error);
      return;
    }
    toast("Note deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          const undo = await restoreNote({ id: note.id });
          const undoError = actionError(undo);
          if (undoError) toast.error(undoError);
          else {
            setHidden((h) => {
              const next = new Set(h);
              next.delete(note.id);
              return next;
            });
            router.refresh();
          }
        },
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter notes" className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="tabular-nums opacity-70">{notes.length - hidden.size}</span>
          </FilterChip>
          <FilterChip active={filter === "general"} onClick={() => setFilter("general")}>
            General
          </FilterChip>
          {serialsWithNotes.map((serial) => (
            <FilterChip key={serial} active={filter === serial} onClick={() => setFilter(serial)}>
              Session {serial}
            </FilterChip>
          ))}
        </div>
        {!composing ? (
          <Button size="lg" className="ml-auto" onClick={() => setComposing(true)}>
            <Plus aria-hidden />
            New note
          </Button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {composing ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <NoteForm
              participantId={participantId}
              onDone={() => {
                setComposing(false);
                router.refresh();
              }}
              onCancel={() => setComposing(false)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {notes.length === 0 && !composing ? (
        <EmptyState
          icon={NotebookPen}
          title="No notes yet"
          description="Record calls, voicemails, texts and emails here so the whole team knows what's happened."
        >
          <Button size="lg" onClick={() => setComposing(true)}>
            <Plus aria-hidden />
            Write the first note
          </Button>
        </EmptyState>
      ) : visible.length === 0 && notes.length > 0 ? (
        <p className="rounded-2xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">No notes match this filter.</p>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {visible.map((note) => (
              <motion.li key={note.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                <NoteCard note={note} participantId={participantId} timezone={timezone} onDelete={() => remove(note)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-transparent bg-secondary font-medium text-secondary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NoteCard({ note, participantId, timezone, onDelete }: { note: NoteItem; participantId: string; timezone: string; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  if (editing) {
    return (
      <NoteForm
        participantId={participantId}
        note={note}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <article className="group rounded-2xl border bg-card p-4 shadow-soft">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <time dateTime={note.createdAt} title={formatInZone(note.createdAt, "MMM d, yyyy h:mm a", timezone)} className="font-medium text-foreground">
          {friendlyDate(note.createdAt, timezone)}
        </time>
        {note.method ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
            <MethodIcon method={note.method} className="size-3.5" />
            {methodLabel(note.method)}
          </span>
        ) : null}
        {note.sessionSerial ? <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">Session {note.sessionSerial}</span> : null}
        <span>{note.author ? `by ${note.author.name}` : "Author not recorded"}</span>
        {note.edited ? <span>· edited</span> : null}
        {note.canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto -my-1 size-8" aria-label="Note options">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{note.text}</p>
    </article>
  );
}

function NoteForm({ participantId, note, onDone, onCancel }: { participantId: string; note?: NoteItem; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState(note?.text ?? "");
  const [method, setMethod] = useState<string | null>(note?.method ?? null);
  const [session, setSession] = useState<string>(note?.sessionSerial ? String(note.sessionSerial) : "none");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idBase = note ? `note-${note.id}` : "note-new";

  function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!text.trim()) return setError("Write a note first.");
    if (!method) return setError("Choose how you contacted them.");
    setError(null);
    startTransition(async () => {
      const sessionSerial = session === "none" ? null : Number(session);
      const result = note
        ? await updateNote({ noteId: note.id, text, method: method as ContactMethod, sessionSerial })
        : await createNote({ participantId, text, method: method as ContactMethod, sessionSerial });
      const message = actionError(result);
      if (message) return setError(message);
      toast.success(note ? "Note updated" : "Note saved");
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft" aria-label={note ? "Edit note" : "New note"}>
      <div>
        <label htmlFor={`${idBase}-text`} className="mb-1.5 block text-sm font-medium">
          {note ? "Edit note" : "New note"}
        </label>
        <AutoTextarea
          id={`${idBase}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          minRows={3}
          maxLength={20000}
          autoFocus
          placeholder="What happened? What's the next step?"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(e);
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p id={`${idBase}-method`} className="mb-1.5 text-sm font-medium">
            Method of contact
          </p>
          <MethodPicker labelledBy={`${idBase}-method`} value={method} onChange={setMethod} invalid={Boolean(error && !method)} />
        </div>
        <div>
          <label htmlFor={`${idBase}-session`} className="mb-1.5 block text-sm font-medium">
            Related session
          </label>
          <Select value={session} onValueChange={setSession}>
            <SelectTrigger id={`${idBase}-session`} className="h-9 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (general note)</SelectItem>
              {CURRICULUM.map((s) => (
                <SelectItem key={s.serial} value={String(s.serial)}>
                  Session {s.serial}: {s.title.length > 28 ? `${s.title.slice(0, 28)}…` : s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          {note ? "Save changes" : "Save note"}
        </Button>
      </div>
    </form>
  );
}
