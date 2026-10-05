"use client";

import { Check, RotateCcw } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { friendlyDate } from "@/lib/dates";
import { saveLevelCopy } from "../actions";
import { DEFAULT_LEVEL_COPY } from "../levels";
import type { LevelCopyItem } from "../queries";

/** One editable level: headline (the promise) and how-to-earn text. */
export function LevelCopyEditor({ item, timezone }: { item: LevelCopyItem; timezone: string }) {
  const [saved, setSaved] = useState({ headline: item.headline, description: item.description, updatedAt: item.updatedAt });
  const [headline, setHeadline] = useState(item.headline);
  const [description, setDescription] = useState(item.description);
  const { executeAsync, isPending } = useAction(saveLevelCopy);
  const dirty = headline.trim() !== saved.headline || description.trim() !== saved.description;
  const defaults = DEFAULT_LEVEL_COPY[item.level];
  const isDefault = headline.trim() === defaults.headline && description.trim() === defaults.description;

  async function save() {
    const result = await executeAsync({ level: item.level, headline, description });
    if (!result?.data) {
      toast.error(result?.serverError ?? result?.validationErrors?.headline?._errors?.[0] ?? "Couldn't save. Please try again.");
      return;
    }
    setSaved({ headline: headline.trim(), description: description.trim(), updatedAt: result.data.updatedAt });
    toast.success(`Level ${item.level} saved.`);
  }

  return (
    <article className="rounded-xl border bg-card p-5">
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="grid size-9 place-items-center rounded-lg bg-primary font-heading font-bold text-primary-foreground">{item.level}</span>
        <div>
          <h2 className="text-base font-semibold">Level {item.level}</h2>
          <p className="text-xs text-muted-foreground">
            {item.level === 1 ? "Starting level" : `From ${item.min.toLocaleString()} points`} · Unlocks: {item.unlocks.join(", ")}
          </p>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {saved.updatedAt ? `Edited ${friendlyDate(saved.updatedAt, timezone)}` : "Default wording"}
        </span>
      </header>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`headline-${item.level}`}>Headline</Label>
          <Input
            id={`headline-${item.level}`}
            value={headline}
            maxLength={300}
            onChange={(event) => setHeadline(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Shown on the levels page and in the level-up message.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`description-${item.level}`}>How to earn points at this level</Label>
          <Textarea
            id={`description-${item.level}`}
            value={description}
            maxLength={600}
            rows={2}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
      <footer className="mt-4 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          disabled={isDefault || isPending}
          onClick={() => {
            setHeadline(defaults.headline);
            setDescription(defaults.description);
          }}
        >
          <RotateCcw /> Use default
        </Button>
        <Button onClick={save} disabled={!dirty || !headline.trim() || isPending}>
          {isPending ? <Spinner /> : <Check />} Save
        </Button>
      </footer>
    </article>
  );
}
