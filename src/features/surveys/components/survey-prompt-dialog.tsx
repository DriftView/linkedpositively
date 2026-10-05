"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, CircleCheck, ClipboardList, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatInZone } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { completeSurveyAction, snoozeSurveyAction } from "../actions";
import type { ParticipantSurvey } from "../service";

export function promptTitle(survey: Pick<ParticipantSurvey, "stage" | "title">) {
  const name = survey.title.toLowerCase();
  if (survey.stage === "last") return `Last day for your ${name}`;
  if (survey.stage === "reminder") return `One more week for your ${name}`;
  return `Your ${name} is ready`;
}

function SurveyActions({
  survey,
  timezone,
  onDone,
  layout,
}: {
  survey: ParticipantSurvey;
  timezone: string;
  onDone: () => void;
  layout: "dialog" | "card";
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"snooze" | "done" | null>(null);

  async function snooze() {
    setPending("snooze");
    await snoozeSurveyAction({ key: survey.key });
    setPending(null);
    onDone();
  }

  async function done() {
    setPending("done");
    const result = await completeSurveyAction({ key: survey.key });
    setPending(null);
    if (result?.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Thank you for taking the survey!");
    onDone();
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col gap-2", layout === "card" && "sm:flex-row sm:items-center")}>
      {survey.href ? (
        <Button asChild size="lg" className="h-11 rounded-full px-6 text-[0.95rem]">
          <a data-primary href={survey.href} target="_blank" rel="noopener" onClick={() => setTimeout(onDone, 300)}>
            Take the survey <ArrowUpRight />
          </a>
        </Button>
      ) : null}
      {layout === "dialog" ? (
        <Button variant="ghost" size="lg" className="h-11 rounded-full" onClick={snooze} disabled={Boolean(pending)}>
          {pending === "snooze" ? <Spinner /> : null}
          Remind me tomorrow
        </Button>
      ) : null}
      <Button variant="link" size="sm" className="text-muted-foreground" onClick={done} disabled={Boolean(pending)}>
        {pending === "done" ? <Spinner /> : null}
        I&apos;ve already finished it
      </Button>
      {survey.closesOn && layout === "card" ? (
        <span className="text-xs text-muted-foreground sm:ml-auto">Open until {formatInZone(survey.closesOn, "EEE, MMM d", timezone)}</span>
      ) : null}
    </div>
  );
}

function Illustration({ stage }: { stage: ParticipantSurvey["stage"] }) {
  return (
    <span
      className={cn(
        "relative flex size-16 items-center justify-center rounded-3xl",
        stage === "last" ? "bg-brand-apricot/30 text-foreground" : "bg-secondary text-primary",
      )}
      aria-hidden
    >
      <ClipboardList className="size-7" />
      <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-brand-magenta text-white ring-4 ring-background">
        <Clock className="size-3.5" />
      </span>
    </span>
  );
}

/**
 * Survey pop-up (legacy: the `#survey` modal that opened on page load, and
 * the midpoint in-app messages). Opens by itself at most once a day.
 */
export function SurveyPromptDialog({ survey, timezone, forceOpen = false }: { survey: ParticipantSurvey; timezone: string; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!survey.autoOpen && !forceOpen) return;
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [survey.autoOpen, forceOpen]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && survey.autoOpen) void snoozeSurveyAction({ key: survey.key });
      }}
    >
      <DialogContent
        className="gap-5 rounded-3xl p-6 sm:max-w-md sm:p-8"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-primary]")?.focus();
        }}
      >
        <DialogHeader className="items-center gap-3 text-center sm:items-center sm:text-center">
          <Illustration stage={survey.stage} />
          <DialogTitle className="font-heading text-2xl font-semibold">{promptTitle(survey)}</DialogTitle>
          <DialogDescription className="text-[0.95rem] leading-relaxed">{survey.message}</DialogDescription>
          {survey.closesOn ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" aria-hidden /> Open until {formatInZone(survey.closesOn, "EEEE, MMM d", timezone)}
            </p>
          ) : null}
        </DialogHeader>
        <SurveyActions survey={survey} timezone={timezone} onDone={() => setOpen(false)} layout="dialog" />
      </DialogContent>
    </Dialog>
  );
}

/** The same prompt as a card, for the Surveys page (and the home page if its owner wants it). */
export function SurveyCard({ survey, timezone }: { survey: ParticipantSurvey; timezone: string }) {
  const [hidden, setHidden] = useState(false);
  if (survey.completed) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-soft">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-success/12 text-success">
          <CircleCheck className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">{survey.title}</p>
          <p className="text-sm text-muted-foreground">Done — thank you! Your answers help the study.</p>
        </div>
      </div>
    );
  }
  if (hidden) return null;
  return (
    <article className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-soft">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-brand-pink/25 blur-3xl dark:bg-brand-magenta/15" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <Illustration stage={survey.stage} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-semibold tracking-wide text-brand-magenta uppercase">{survey.stage === "last" ? "Last day" : "Survey"}</p>
          <h2 className="text-xl font-semibold">{promptTitle(survey)}</h2>
          <p className="leading-relaxed text-muted-foreground">{survey.message}</p>
          <div className="pt-2">
            <SurveyActions survey={survey} timezone={timezone} onDone={() => setHidden(false)} layout="card" />
          </div>
        </div>
      </div>
    </article>
  );
}
