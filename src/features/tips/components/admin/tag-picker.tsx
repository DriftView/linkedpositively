"use client";

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { saveTipTag } from "../../admin-actions";

export type PickerTag = { id: string; name: string };

/** Searchable multi-select for tip topics, with "create topic" inline. */
export function TagPicker({
  id,
  tags,
  value,
  onChange,
  onCreated,
  invalid,
}: {
  id?: string;
  tags: PickerTag[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreated: (tag: PickerTag) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, startCreating] = useTransition();
  const byId = new Map(tags.map((t) => [t.id, t]));
  const exact = tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  function toggle(tagId: string) {
    onChange(value.includes(tagId) ? value.filter((v) => v !== tagId) : [...value, tagId]);
  }

  function create() {
    const name = search.trim();
    if (name.length < 2) return;
    startCreating(async () => {
      const result = await saveTipTag({ kind: "tag", name });
      if (result?.serverError || !result?.data) return void toast.error(result?.serverError ?? "Couldn't create that topic.");
      onCreated({ id: result.data.id, name: result.data.name });
      onChange([...value, result.data.id]);
      setSearch("");
      toast.success(`Topic “${result.data.name}” created`);
    });
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className="h-9 w-full justify-between font-normal text-muted-foreground"
          >
            {value.length ? `${value.length} ${value.length === 1 ? "topic" : "topics"} selected` : "Choose topics…"}
            <ChevronsUpDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search or create a topic" value={search} onValueChange={setSearch} />
            <CommandList className="max-h-72">
              <CommandEmpty>No topic called “{search}”.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem key={tag.id} value={tag.name} onSelect={() => toggle(tag.id)}>
                    <Check className={cn("size-4", value.includes(tag.id) ? "opacity-100" : "opacity-0")} />
                    {tag.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              {search.trim().length >= 2 && !exact ? (
                <CommandGroup forceMount>
                  <CommandItem forceMount value={`__create ${search}`} onSelect={create} disabled={creating}>
                    <Plus className="size-4" /> Create topic “{search.trim()}”
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected topics">
          {value.map((tagId) => (
            <li key={tagId}>
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pr-1 pl-2.5 text-xs font-medium text-secondary-foreground">
                {byId.get(tagId)?.name ?? "Unknown"}
                <button
                  type="button"
                  onClick={() => toggle(tagId)}
                  aria-label={`Remove ${byId.get(tagId)?.name ?? "topic"}`}
                  className="inline-flex size-5 items-center justify-center rounded-full hover:bg-background/70"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
