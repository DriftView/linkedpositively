"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, NotebookPen, Pencil } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveAboutMe } from "../actions";
import { ABOUT_ME_MAX } from "../schemas";

/** "About Me", edited in place. Saves optimistically; ⌘/Ctrl+Enter saves, Esc cancels. */
export function AboutMeCard({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const { executeAsync, isPending } = useAction(saveAboutMe);

  function edit() {
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(area.current.value.length, area.current.value.length);
    });
  }

  async function save() {
    const previous = value;
    const next = draft.trim();
    setValue(next);
    setEditing(false);
    const result = await executeAsync({ aboutMe: next });
    if (!result?.data) {
      setValue(previous);
      setDraft(next);
      setEditing(true);
      toast.error(result?.serverError ?? result?.validationErrors?.aboutMe?._errors?.[0] ?? "We couldn't save that. Please try again.");
      return;
    }
    toast.success("Saved!");
    if (result.data.completed) toast.success("Profile complete! +50 points");
  }

  const over = draft.length > ABOUT_ME_MAX;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="about-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="about-title" className="flex items-center gap-2 text-lg font-semibold">
          <NotebookPen className="size-4.5 text-brand-magenta" aria-hidden /> About me
        </h2>
        {!editing && value ? (
          <Button variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={edit}>
            <Pencil /> Edit
          </Button>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <label htmlFor="about-me" className="sr-only">
              About me
            </label>
            <Textarea
              id="about-me"
              ref={area}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Tell people about yourself..."
              rows={4}
              className="min-h-28 resize-y rounded-xl text-[0.95rem] leading-relaxed"
              aria-invalid={over}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false);
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !over) void save();
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={cn("text-xs tabular-nums", over ? "font-medium text-destructive" : "text-muted-foreground")}>
                {draft.length}/{ABOUT_ME_MAX}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" className="h-10 rounded-full" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button className="h-10 rounded-full px-5" onClick={save} disabled={over || isPending || draft.trim() === value}>
                  {isPending ? <Spinner /> : <Check />} Save
                </Button>
              </div>
            </div>
          </motion.div>
        ) : value ? (
          <motion.p
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[0.95rem] leading-relaxed whitespace-pre-line text-foreground/90"
          >
            {value}
          </motion.p>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={edit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full rounded-2xl border border-dashed bg-muted/40 p-4 text-left text-sm transition-colors hover:bg-secondary/60"
          >
            <span className="block font-semibold">Tell people about yourself</span>
            <span className="text-muted-foreground">What do you love doing? What brings you here? Only members can see it.</span>
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}
