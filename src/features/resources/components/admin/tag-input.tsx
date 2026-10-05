"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";

/** Chips input for resource tags, with suggestions from existing tags. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const name = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return;
    const existing = suggestions.find((tag) => tag.toLowerCase() === name.toLowerCase()) ?? name;
    if (!value.some((tag) => tag.toLowerCase() === existing.toLowerCase())) onChange([...value, existing]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary pr-1 pl-2.5 text-xs font-medium text-secondary-foreground">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="grid size-4 place-items-center rounded-full hover:bg-background/60"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={listId}
        onChange={(event) => {
          const next = event.target.value;
          if (next.endsWith(",")) add(next.slice(0, -1));
          else setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          } else if (event.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(draft)}
        placeholder={value.length ? "Add another…" : "Type a tag and press Enter"}
        className="h-6 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <datalist id={listId}>
        {suggestions
          .filter((tag) => !value.includes(tag))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
    </div>
  );
}
