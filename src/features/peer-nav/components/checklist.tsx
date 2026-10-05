"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Answers } from "../answers";
import type { ChecklistSection } from "../curriculum";
import { AutoTextarea } from "./auto-textarea";

export function sectionAnchor(index: number) {
  return `section-${index + 1}`;
}

/** Strips the trailing colon some legacy section titles carry. */
export function sectionTitle(title: string) {
  return title.replace(/:\s*$/, "");
}

/** One checklist section of a session: check items, each with its note boxes. */
export function ChecklistSectionCard({
  section,
  index,
  answers,
  onChange,
}: {
  section: ChecklistSection;
  index: number;
  answers: Answers;
  onChange: (key: string, value: boolean | string) => void;
}) {
  const done = section.items.filter((item) => answers[item.key] === true).length;
  const total = section.items.length;
  return (
    <section id={sectionAnchor(index)} aria-labelledby={`${sectionAnchor(index)}-title`} className="scroll-mt-32 rounded-2xl border bg-card shadow-soft">
      <header className="flex items-center gap-3 border-b px-5 py-3.5">
        <span className="grid size-7 place-items-center rounded-lg bg-secondary font-heading text-xs font-semibold text-secondary-foreground">{index + 1}</span>
        <h2 id={`${sectionAnchor(index)}-title`} className="flex-1 font-sans text-[0.95rem] font-semibold">
          {sectionTitle(section.title)}
        </h2>
        <span className={cn("text-xs font-medium tabular-nums", done === total ? "text-success" : "text-muted-foreground")}>
          {done}/{total}
        </span>
      </header>
      <ul className="divide-y">
        {section.items.map((item) => {
          const checked = answers[item.key] === true;
          const id = `chk-${item.key}`;
          return (
            <li key={item.key} className="px-5 py-3.5">
              <label htmlFor={id} className="group flex cursor-pointer items-start gap-3">
                <input
                  id={id}
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  onChange={(e) => onChange(item.key, e.target.checked)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-md border-2 transition-all peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                    checked ? "scale-100 border-primary bg-primary text-primary-foreground" : "border-input bg-background group-hover:border-primary/60",
                  )}
                >
                  <Check className={cn("size-3.5 transition-transform", checked ? "scale-100" : "scale-0")} strokeWidth={3.5} />
                </span>
                <span className={cn("text-sm leading-relaxed transition-colors", checked ? "text-foreground" : "text-foreground/90")}>{item.label}</span>
              </label>
              {item.texts.length ? (
                <div className="mt-2.5 space-y-2.5 pl-8.5">
                  {item.texts.map((text) => {
                    const textId = `txt-${text.key}`;
                    return (
                      <div key={text.key}>
                        {text.label ? (
                          <label htmlFor={textId} className="mb-1 block text-[0.8rem] font-medium text-muted-foreground">
                            {text.label}
                          </label>
                        ) : null}
                        <AutoTextarea
                          id={textId}
                          aria-label={text.label ? undefined : `Notes for: ${item.label}`}
                          value={(answers[text.key] as string | undefined) ?? ""}
                          onChange={(e) => onChange(text.key, e.target.value)}
                          placeholder={text.label ? "" : "Notes"}
                          minRows={1}
                          maxLength={10000}
                          className="bg-muted/40 dark:bg-input/20"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Compact read-only rendering of a saved version (history view). */
export function ReadOnlyChecklist({ sections, answers }: { sections: ChecklistSection[]; answers: Answers }) {
  return (
    <div className="space-y-5">
      {sections.map((section, index) => (
        <section key={section.title + index}>
          <h3 className="font-sans text-sm font-semibold">{sectionTitle(section.title)}</h3>
          <ul className="mt-2 space-y-2">
            {section.items.map((item) => {
              const checked = answers[item.key] === true;
              const texts = item.texts.filter((t) => typeof answers[t.key] === "string" && answers[t.key]);
              return (
                <li key={item.key} className="text-sm">
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked ? <Check aria-hidden className="size-3" strokeWidth={3.5} /> : null}
                    </span>
                    <span className={cn(!checked && "text-muted-foreground")}>
                      <span className="sr-only">{checked ? "Done: " : "Not done: "}</span>
                      {item.label}
                    </span>
                  </span>
                  {texts.map((t) => (
                    <p key={t.key} className="mt-1 ml-6 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[0.8rem] whitespace-pre-wrap">
                      {t.label ? <span className="block font-medium text-muted-foreground">{t.label}</span> : null}
                      {answers[t.key] as string}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
