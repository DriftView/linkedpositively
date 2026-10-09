"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpen,
  ExternalLink,
  Globe,
  HeartHandshake,
  LifeBuoy,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatMiles, phoneHref } from "@/features/resources/lib";
import { startThread } from "@/features/peer-nav/message-actions";
import { cn } from "@/lib/utils";
import { recordClientEventAction } from "../actions";
import { CRISIS_LINES } from "../constants";
import { parseCoachMarkdown } from "../lib";
import type { AiCards } from "../types";

/** A coach reply's text: the small Markdown subset, rendered as elements (never HTML). */
export function CoachMarkdown({ text }: { text: string }) {
  const blocks = parseCoachMarkdown(text);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <p key={index}>
            {block.spans.map((span, i) =>
              span.bold ? <strong key={i}>{span.text}</strong> : <span key={i}>{span.text}</span>,
            )}
          </p>
        ) : block.ordered ? (
          <ol key={index} className="list-decimal space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>
                {item.map((span, j) =>
                  span.bold ? <strong key={j}>{span.text}</strong> : <span key={j}>{span.text}</span>,
                )}
              </li>
            ))}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5 marker:text-brand-magenta">
            {block.items.map((item, i) => (
              <li key={i}>
                {item.map((span, j) =>
                  span.bold ? <strong key={j}>{span.text}</strong> : <span key={j}>{span.text}</span>,
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export function CrisisCard({ level }: { level: "elevated" | "urgent" }) {
  const lines = level === "urgent" ? CRISIS_LINES.slice(0, 3) : CRISIS_LINES;
  return (
    <section
      aria-label="Get help now"
      role={level === "urgent" ? "alert" : undefined}
      className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 dark:bg-destructive/10"
    >
      <h3 className="flex items-center gap-2 font-sans text-sm font-semibold text-destructive">
        <LifeBuoy aria-hidden className="size-4" />
        {level === "urgent"
          ? "You don't have to go through this alone. Help is available right now."
          : "Support is here if you need it"}
      </h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {lines.map((line) => (
          <li key={line.id}>
            <a
              href={line.href}
              className="flex min-h-11 flex-col justify-center rounded-xl border bg-card px-3 py-2 text-sm shadow-soft transition-colors outline-none hover:border-destructive/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="font-semibold">{line.label}</span>
              <span className="text-xs text-muted-foreground">{line.detail}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        The study team has been asked to check in. They aren&apos;t an emergency service and may not see this right
        away.
      </p>
    </section>
  );
}

export function ResourceCards({ resources }: { resources: NonNullable<AiCards["resources"]> }) {
  return (
    <section aria-label="Places that may help">
      <ul className="grid gap-2">
        {resources.map((resource) => {
          const tel = phoneHref(resource.phone);
          return (
            <li key={resource.id} className="rounded-xl border bg-card p-3 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-sky/15 text-brand-plum dark:text-brand-sky">
                  <MapPin aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {resource.href ? (
                    <Link
                      href={resource.href}
                      className="font-semibold text-foreground hover:text-primary hover:underline"
                    >
                      {resource.title}
                    </Link>
                  ) : (
                    <p className="font-semibold">{resource.title}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {resource.distanceMiles != null ? `${formatMiles(resource.distanceMiles)} · ` : ""}
                    {resource.address}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resource.mapsHref ? (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-full">
                        <a href={resource.mapsHref} target="_blank" rel="noreferrer">
                          <Navigation aria-hidden /> Directions
                        </a>
                      </Button>
                    ) : null}
                    {tel ? (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-full">
                        <a href={tel.href}>
                          <Phone aria-hidden /> Call
                        </a>
                      </Button>
                    ) : null}
                    {resource.website ? (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-full">
                        <a href={resource.website} target="_blank" rel="noreferrer">
                          <Globe aria-hidden /> Website
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SOURCE_LABEL = {
  tip: "Thrive Tip",
  page: "Help page",
  glossary: "Glossary",
  article: "Study-approved info",
} as const;

export function SourceList({ sources }: { sources: NonNullable<AiCards["sources"]> }) {
  return (
    <section aria-label="Where this comes from" className="text-xs">
      <p className="mb-1.5 flex items-center gap-1.5 font-medium text-muted-foreground">
        <BookOpen aria-hidden className="size-3.5" /> From Link Positively
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <li key={`${source.kind}-${source.id}`}>
            {source.href ? (
              <Link
                href={source.href}
                className="inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground hover:bg-secondary/70"
              >
                <span className="text-muted-foreground">{SOURCE_LABEL[source.kind]}:</span> {source.title}
                <ExternalLink aria-hidden className="size-3 opacity-60" />
              </Link>
            ) : (
              <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1">
                <span className="text-muted-foreground">{SOURCE_LABEL[source.kind]}:</span> {source.title}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HandoffCard({ handoff }: { handoff: NonNullable<AiCards["handoff"]> }) {
  const [draft, setDraft] = useState(handoff.draft);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function send() {
    setState("sending");
    const result = await startThread({ subject: "From the AI Coach", body: draft.trim() });
    if (result?.data?.threadId) {
      setState("sent");
      toast.success(`Sent to ${handoff.coachName ?? "your navigator"}`);
      void recordClientEventAction({ event: "handoff_sent" });
    } else {
      setState("idle");
      toast.error(result?.serverError ?? "We couldn't send that. Please try again from Messages.");
    }
  }

  if (handoff.kind === "navigator") {
    return (
      <section
        aria-label="Message your peer navigator"
        className="rounded-2xl border border-brand-magenta/25 bg-brand-magenta/5 p-4 dark:bg-brand-magenta/10"
      >
        <h3 className="flex items-center gap-2 font-sans text-sm font-semibold">
          <HeartHandshake aria-hidden className="size-4 text-brand-magenta" />
          Message {handoff.coachName ?? "your peer navigator"}
        </h3>
        {state === "sent" ? (
          <p className="mt-2 text-sm">
            Sent. {handoff.coachName ?? "Your navigator"} will reply in{" "}
            <Link
              href={handoff.href ?? "/coaching/messages"}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Messages
            </Link>
            .
          </p>
        ) : (
          <>
            <label htmlFor="handoff-draft" className="mt-2 block text-xs text-muted-foreground">
              Here&apos;s a draft. Change anything you like; nothing is sent until you tap Send.
            </label>
            <textarea
              id="handoff-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={5000}
              className="mt-1.5 block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
            />
            <div className="mt-2 flex justify-end">
              <Button
                onClick={send}
                disabled={state === "sending" || !draft.trim()}
                className="h-10 rounded-full px-4 font-semibold"
              >
                {state === "sending" ? <Spinner /> : <Send aria-hidden />}
                Send
              </Button>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Reach the study team"
      className="rounded-2xl border border-brand-magenta/25 bg-brand-magenta/5 p-4 dark:bg-brand-magenta/10"
    >
      <h3 className="flex items-center gap-2 font-sans text-sm font-semibold">
        <HeartHandshake aria-hidden className="size-4 text-brand-magenta" />
        Talk to a person on the study team
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        They can help you find the right support. You could start with something like: &ldquo;{handoff.draft}&rdquo;
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {handoff.contactEmail ? (
          <Button asChild variant="outline" className="h-10 rounded-full px-4">
            <a
              href={`mailto:${handoff.contactEmail}?subject=${encodeURIComponent("Question from the AI Coach")}&body=${encodeURIComponent(handoff.draft)}`}
            >
              <Mail aria-hidden /> Email the team
            </a>
          </Button>
        ) : null}
        {handoff.contactPhone && phoneHref(handoff.contactPhone) ? (
          <Button asChild variant="outline" className="h-10 rounded-full px-4">
            <a href={phoneHref(handoff.contactPhone)!.href}>
              <Phone aria-hidden /> Call {handoff.contactPhone}
            </a>
          </Button>
        ) : null}
        {handoff.href ? (
          <Button asChild variant="outline" className="h-10 rounded-full px-4">
            <Link href={handoff.href}>
              <LifeBuoy aria-hidden /> Get help page
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function ReplyCards({ cards, className }: { cards: AiCards | null; className?: string }) {
  if (!cards) return null;
  const { resources, sources, handoff } = cards;
  if (!resources?.length && !sources?.length && !handoff) return null;
  return (
    <div className={cn("space-y-3", className)}>
      {resources?.length ? <ResourceCards resources={resources} /> : null}
      {handoff ? <HandoffCard handoff={handoff} /> : null}
      {sources?.length ? <SourceList sources={sources} /> : null}
    </div>
  );
}
