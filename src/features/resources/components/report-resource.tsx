"use client";

import { CircleCheck, Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ResourceReportReason } from "@/server/db/schema";
import { reportResourceAction } from "../actions";
import { actionError } from "../client";

const REASONS: { value: ResourceReportReason; label: string; hint: string }[] = [
  { value: "closed", label: "It has closed or moved", hint: "The place isn't there any more." },
  { value: "wrong_info", label: "Some details are wrong", hint: "Hours, phone, address or website." },
  { value: "not_helpful", label: "It wasn't welcoming or helpful", hint: "Tell us what happened, if you like." },
  { value: "other", label: "Something else", hint: "" },
];

/** "Something wrong?" report (Drupal flag `resource`, "No Longer Available"). */
export function ReportResource({ resourceId, reported }: { resourceId: string; reported: ResourceReportReason | null }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(Boolean(reported));
  const [reason, setReason] = useState<ResourceReportReason>(reported ?? "closed");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await reportResourceAction({ resourceId, reason, note });
      const error = actionError(result);
      if (error) {
        toast.error(error);
        return;
      }
      setDone(true);
      setOpen(false);
      toast.success("Thanks for letting us know", { description: "Our team will check this resource." });
    });
  }

  if (done) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck aria-hidden className="size-4 text-success" />
        Thanks, you told us something&apos;s wrong here. Our team will check it.
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-full px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <Flag aria-hidden className="size-4" />
          Something wrong with this listing?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>What&apos;s wrong?</DialogTitle>
            <DialogDescription>Your report goes to the study team, not other members.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={reason} onValueChange={(value) => setReason(value as ResourceReportReason)} className="my-4 gap-2">
            {REASONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`reason-${option.value}`}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary"
              >
                <RadioGroupItem id={`reason-${option.value}`} value={option.value} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  {option.hint ? <span className="block text-sm text-muted-foreground">{option.hint}</span> : null}
                </span>
              </Label>
            ))}
          </RadioGroup>
          <Label htmlFor="report-note" className="mb-1.5 block">
            Anything else we should know? <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="report-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="For example, the new phone number or opening hours."
          />
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-10 rounded-full px-4">
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="h-10 rounded-full px-5">
              {pending ? <Spinner /> : null}
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
