"use client";

import { BellOff, BellRing, Pencil } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveCheckinReminder, updateTrackerReminder } from "../actions";
import { describeSchedule } from "../schedule";
import type { PointsResult, ReminderSchedule } from "../types";
import { ReminderFields, smsBlocked, type SmsStatus } from "./reminder-fields";
import { ResponsiveDialog } from "./responsive-dialog";

type Target = { type: "checkin" } | { type: "tracker"; trackerId: string; textPlaceholder: string };

/**
 * A reminder's summary with a quick on/off switch and an editor
 * (legacy "Notifications Everyday | 8:00 pm" / "Turned Off" panes).
 */
export function ReminderCard({
  title,
  reminder,
  target,
  sms,
  timezone,
  className,
  bare = false,
}: {
  title: string;
  reminder: ReminderSchedule;
  target: Target;
  sms: SmsStatus;
  timezone: string;
  className?: string;
  /** Without its own card chrome, for use inside lists. */
  bare?: boolean;
}) {
  const [current, setCurrent] = useState(reminder);
  const [draft, setDraft] = useState(reminder);
  const [open, setOpen] = useState(false);
  const checkinAction = useAction(saveCheckinReminder);
  const trackerAction = useAction(updateTrackerReminder);
  const pending = checkinAction.isPending || trackerAction.isPending;

  async function persist(next: ReminderSchedule) {
    const result =
      target.type === "checkin"
        ? await checkinAction.executeAsync(next)
        : await trackerAction.executeAsync({ trackerId: target.trackerId, reminder: next });
    if (!result?.data) {
      toast.error(result?.serverError ?? "We couldn't save your reminder. Please try again.");
      return false;
    }
    const points = (result.data as { points?: PointsResult }).points;
    setCurrent(next);
    toast.success(next.enabled ? "Reminder saved" : "Reminder turned off", {
      description: points?.awarded ? `You earned ${points.points} points for setting it up.` : describeSchedule(next),
    });
    return true;
  }

  async function toggle(enabled: boolean) {
    const next = { ...current, enabled };
    if (enabled && smsBlocked(next, sms)) {
      setDraft({ ...next, channel: "in_app" });
      setOpen(true);
      return;
    }
    const previous = current;
    setCurrent(next);
    if (!(await persist(next))) setCurrent(previous);
  }

  return (
    <div className={cn(!bare && "rounded-2xl border bg-card p-4 shadow-soft sm:p-5", className)}>
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full transition-colors",
            current.enabled ? "bg-brand-sky/20 text-primary dark:bg-brand-sky/15" : "bg-muted text-muted-foreground",
          )}
        >
          {current.enabled ? <BellRing className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{describeSchedule(current)}</p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => {
              setDraft({ ...current, enabled: true });
              setOpen(true);
            }}
          >
            <Pencil className="size-3.5" aria-hidden />
            {current.enabled ? "Change" : "Set up"}
          </button>
        </div>
        <Switch
          checked={current.enabled}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label={`${title}: reminders ${current.enabled ? "on" : "off"}`}
        />
      </div>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description="We'll nudge you to check in. You can change or turn this off any time."
      >
        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await persist({ ...draft, enabled: true })) setOpen(false);
          }}
        >
          <ReminderFields
            value={draft}
            onChange={setDraft}
            sms={sms}
            timezone={timezone}
            textPlaceholder={target.type === "tracker" ? target.textPlaceholder : undefined}
          />
          <Button
            type="submit"
            className="h-11 w-full rounded-full text-[0.95rem]"
            disabled={pending || smsBlocked({ ...draft, enabled: true }, sms)}
          >
            {pending ? <Spinner /> : null}
            Save reminder
          </Button>
        </form>
      </ResponsiveDialog>
    </div>
  );
}
