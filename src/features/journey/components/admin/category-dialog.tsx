"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { actionError } from "@/features/resources/client";
import { saveCategoryAction } from "../../admin-actions";
import { ACCENTS } from "../../lib";
import type { Accent } from "../../queries";

type Values = { id?: string; name: string; description: string; accent: Accent; published: boolean };

/** Create / edit a journey area (Drupal journey_category). */
export function CategoryDialog({ initial, trigger, onSaved }: { initial?: Values; trigger: React.ReactNode; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial ?? { name: "", description: "", accent: "plum", published: true });
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveCategoryAction(values);
      const error = actionError(result);
      if (error || !result?.data) {
        toast.error(error ?? "Couldn't save.");
        return;
      }
      toast.success(values.id ? "Area saved" : "Area created");
      setOpen(false);
      if (onSaved) onSaved(result.data.id);
      else router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValues(initial ?? { name: "", description: "", accent: "plum", published: true });
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{values.id ? "Edit area" : "New area of life"}</DialogTitle>
            <DialogDescription>Areas group goal ideas, like Health or Friends.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="category-name">Name</Label>
              <Input id="category-name" value={values.name} maxLength={120} required autoFocus onChange={(event) => setValues({ ...values, name: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="category-description">Short description</Label>
              <Textarea id="category-description" value={values.description} maxLength={500} rows={2} onChange={(event) => setValues({ ...values, description: event.target.value })} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Colour</legend>
              <div className="flex gap-2">
                {(Object.keys(ACCENTS) as Accent[]).map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    aria-label={accent}
                    aria-pressed={values.accent === accent}
                    onClick={() => setValues({ ...values, accent })}
                    className={cn("size-9 rounded-full ring-offset-2 ring-offset-background transition-all", ACCENTS[accent].bar, values.accent === accent && "ring-2 ring-foreground")}
                  />
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-between">
              <Label htmlFor="category-published">Visible to members</Label>
              <Switch id="category-published" checked={values.published} onCheckedChange={(published) => setValues({ ...values, published })} />
            </div>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
