"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/features/admin/components/run-action";
import { cn } from "@/lib/utils";
import { AI_ALERT_STATUSES, type AiAlertStatus } from "@/server/db/schema/ai";
import { updateAlertAction } from "../../admin-actions";
import { STATUS_LABEL } from "./labels";

export function AlertReviewForm({ id, status, staffNote }: { id: string; status: AiAlertStatus; staffNote: string }) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<AiAlertStatus>(status === "open" ? "in_review" : status);
  const [note, setNote] = useState(staffNote);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const ok = await runAction(updateAlertAction({ id, status: nextStatus, staffNote: note }), "Alert updated");
    setPending(false);
    if (ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="font-sans text-base font-semibold">Follow-up</h2>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <div className="inline-flex rounded-lg bg-muted p-1" role="radiogroup">
          {AI_ALERT_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={nextStatus === value}
              onClick={() => setNextStatus(value)}
              className={cn("h-8 rounded-md px-3 text-sm font-medium text-muted-foreground", nextStatus === value && "bg-card text-foreground shadow-soft")}
            >
              {STATUS_LABEL[value]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="alert-note">Staff note (what you did, who you contacted)</Label>
        <textarea
          id="alert-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={4000}
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
        />
        <p className="text-xs text-muted-foreground">Visible to staff only. Recorded in the audit log (without the note text).</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save follow-up
      </Button>
    </form>
  );
}
