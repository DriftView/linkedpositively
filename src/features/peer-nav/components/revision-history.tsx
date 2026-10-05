"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { formatInZone, friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { loadRevision } from "../actions";
import type { Answers } from "../answers";
import { SESSION_FOOTER, SESSION_START_KEY, YES, type ChecklistSection } from "../curriculum";
import type { RevisionSummary } from "../types";
import { actionError } from "./action-result";
import { ReadOnlyChecklist } from "./checklist";

/** Every saved version of the session, newest first, with a read-only view of each. */
export function RevisionHistory({
  participantId,
  sections,
  revisions,
  timezone,
  onRestore,
  trigger,
}: {
  participantId: string;
  sections: ChecklistSection[];
  revisions: RevisionSummary[];
  timezone: string;
  onRestore: (answers: Answers) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ summary: RevisionSummary; answers: Answers } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function view(summary: RevisionSummary) {
    setLoadingId(summary.id);
    startTransition(async () => {
      const result = await loadRevision({ participantId, revisionId: summary.id });
      setLoadingId(null);
      const error = actionError(result);
      if (error || !result?.data) {
        toast.error(error ?? "That version couldn't be loaded.");
        return;
      }
      setSelected({ summary, answers: result.data.answers });
    });
  }

  const yesNo = (v: unknown) => (v === YES ? "Yes" : v ? "No" : "—");

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelected(null);
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <History aria-hidden className="size-4" />
            {selected ? `Saved ${friendlyDate(selected.summary.createdAt, timezone)}` : "Session history"}
          </SheetTitle>
          <SheetDescription>
            {selected
              ? `${selected.summary.coach?.name ?? "Unknown coach"} · ${formatInZone(selected.summary.createdAt, "MMM d, yyyy 'at' h:mm a", timezone)}`
              : "Every save is kept. Open a version to see exactly what was recorded."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {selected ? (
            <div className="space-y-5">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  <ArrowLeft aria-hidden />
                  All versions
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  onClick={() => {
                    onRestore(selected.answers);
                    setOpen(false);
                    setSelected(null);
                  }}
                >
                  Load into the form
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Start time", selected.answers[SESSION_START_KEY]],
                  ["End time", selected.answers[SESSION_FOOTER.endTime.key]],
                  ["On the original date", yesNo(selected.answers[SESSION_FOOTER.onSchedule.key])],
                  ["Reason", selected.answers[SESSION_FOOTER.rescheduleReason.key]],
                  ["On their phone", yesNo(selected.answers[SESSION_FOOTER.onPhone.key])],
                  ["Used video", yesNo(selected.answers[SESSION_FOOTER.onVideo.key])],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                    <dt className="text-xs text-muted-foreground">{label as string}</dt>
                    <dd className="font-medium">{(value as string) || "—"}</dd>
                  </div>
                ))}
              </dl>
              <ReadOnlyChecklist sections={sections} answers={selected.answers} />
            </div>
          ) : revisions.length ? (
            <ol className="space-y-1">
              {revisions.map((revision, index) => (
                <li key={revision.id}>
                  <button
                    type="button"
                    onClick={() => view(revision)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", index === 0 ? "bg-primary" : "bg-border")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {friendlyDate(revision.createdAt, timezone)}
                        {index === 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">Latest</span> : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">{revision.coach?.name ?? "Unknown coach"}</span>
                    </span>
                    {revision.complete ? <CheckCircle2 aria-label="Marked complete" className="size-4 text-success" /> : null}
                    {loadingId === revision.id ? <Spinner className="size-4" /> : null}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">Nothing saved yet. Your first save will appear here.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
