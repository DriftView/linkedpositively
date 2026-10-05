"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteTracker } from "../actions";
import type { TrackerCalendarDay, TrackerSummary } from "../types";
import { PointsBurst } from "./points-burst";
import { ReminderCard } from "./reminder-card";
import type { SmsStatus } from "./reminder-fields";
import { TrackerCalendar } from "./tracker-calendar";
import { TrackerIcon, useTrackerCheckin, YesNo } from "./tracker-bits";

/** One personal tracker: today's answer, its calendar, its reminder, and removal. */
export function TrackerDetail({
  tracker,
  days,
  today,
  since,
  sms,
  timezone,
}: {
  tracker: TrackerSummary;
  days: TrackerCalendarDay[];
  today: string;
  since: string;
  sms: SmsStatus;
  timezone: string;
}) {
  const { value, answer, burst } = useTrackerCheckin(tracker.id, tracker.today);

  return (
    <div className="space-y-8">
      <section aria-labelledby="tracker-title" className="animate-rise rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
        <div className="mb-5 flex items-start gap-3.5">
          <TrackerIcon kind={tracker.kind} />
          <div className="min-w-0 flex-1">
            <h2 id="tracker-title" className="text-xl leading-tight font-semibold">
              {tracker.label}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">One quick answer each day.</p>
          </div>
          <PointsBurst points={burst.points} burstKey={burst.key} />
        </div>
        <p className="mb-3 font-heading text-lg font-semibold">{tracker.question}</p>
        <YesNo value={value} onChange={answer} label={tracker.question} size="lg" />
        <p className="mt-2.5 text-sm text-muted-foreground">
          {value === null ? "You can change your answer any time today." : "Saved. You can change it any time today."}
        </p>
      </section>

      <section aria-labelledby="history-title" className="animate-rise [animation-delay:60ms]">
        <h2 id="history-title" className="mb-3 text-xl font-semibold">
          History
        </h2>
        <TrackerCalendar days={days} today={today} todayValue={value} since={since} />
      </section>

      <section aria-labelledby="reminder-title" className="animate-rise [animation-delay:120ms]">
        <h2 id="reminder-title" className="mb-3 text-xl font-semibold">
          Reminder
        </h2>
        <ReminderCard
          title={`${tracker.label} reminder`}
          reminder={tracker.reminder}
          target={{ type: "tracker", trackerId: tracker.id, textPlaceholder: tracker.question }}
          sms={sms}
          timezone={timezone}
        />
      </section>

      <DeleteTracker id={tracker.id} label={tracker.label} />
    </div>
  );
}

function DeleteTracker({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const { executeAsync, isPending } = useAction(deleteTracker);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="h-10 rounded-full px-4 text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 data-icon="inline-start" />
          Stop tracking {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop tracking {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            It will leave your list and its reminders will stop. Your past answers stay in your study record.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={async (event) => {
              event.preventDefault();
              const result = await executeAsync({ trackerId: id });
              if (!result?.data) {
                toast.error(result?.serverError ?? "We couldn't remove that tracker. Please try again.");
                return;
              }
              toast.success(`You've stopped tracking ${result.data.label}.`);
              router.replace("/tracker/personal");
            }}
          >
            {isPending ? <Spinner /> : null}
            Stop tracking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
