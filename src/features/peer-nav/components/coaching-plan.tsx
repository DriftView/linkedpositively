"use client";

import { Check, Download, FileText } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { PlanSession } from "../types";

/**
 * The participant's "Coaching Plans": sessions in the order their peer
 * navigator set, with completion ticks, descriptions and worksheets.
 * One session open at a time (legacy accordion); the next one starts open.
 */
export function CoachingPlan({ sessions }: { sessions: PlanSession[] }) {
  const next = sessions.find((s) => s.status !== "complete") ?? sessions[0];
  return (
    <Accordion type="single" collapsible defaultValue={next ? String(next.serial) : undefined} className="gap-3">
      {sessions.map((session, index) => {
        const done = session.status === "complete";
        const current = session.serial === next?.serial && !done;
        return (
          <AccordionItem
            key={session.serial}
            value={String(session.serial)}
            className={cn("overflow-hidden rounded-2xl border bg-card shadow-soft not-last:border-b", current && "ring-2 ring-primary/25")}
          >
            <AccordionTrigger className="items-center gap-3 rounded-none px-4 py-4 hover:no-underline focus-visible:ring-inset sm:px-5">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors",
                  done ? "bg-success text-success-foreground" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check aria-hidden className="size-4.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {done ? "Completed" : current ? (session.status === "in_progress" ? "In progress" : "Up next") : `Session ${index + 1}`}
                  <span className="sr-only">{done ? ", this session is complete" : ", not complete yet"}</span>
                </span>
                <span className="mt-0.5 block text-[0.95rem] leading-snug font-semibold">{session.title}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-5 sm:px-5 sm:pl-17">
              <p className="text-[0.95rem] leading-relaxed text-foreground/90">{session.description}</p>
              <div className="mt-4">
                <h3 className="mb-2 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">Session files</h3>
                {session.worksheets.length ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {session.worksheets.map((sheet) => (
                      <li key={sheet.href}>
                        <a
                          href={sheet.href}
                          target="_blank"
                          rel="noopener"
                          className="group flex min-h-12 items-center gap-3 rounded-xl border bg-background px-3 py-2 no-underline! outline-none transition-colors hover:border-primary/40 hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                            <FileText aria-hidden className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 text-sm leading-snug font-medium">{sheet.title}</span>
                          <Download aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
                          <span className="sr-only">(PDF, opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No files for this session.</p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
