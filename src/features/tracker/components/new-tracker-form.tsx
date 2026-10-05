"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, PenLine } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createTracker } from "../actions";
import { TRACKER_PRESETS, trackerQuestion } from "../kinds";
import { channelLabel, DEFAULT_SCHEDULE, describeWhen } from "../schedule";
import type { ReminderSchedule, TrackerKind } from "../types";
import { ReminderFields, smsBlocked, type SmsStatus } from "./reminder-fields";
import { Segmented } from "./segmented";
import { TrackerIcon } from "./tracker-bits";

const reveal = {
  initial: { opacity: 0, y: 10, height: 0 },
  animate: { opacity: 1, y: 0, height: "auto" },
  exit: { opacity: 0, y: -6, height: 0 },
  transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const },
};

/**
 * Create a personal tracker, one question at a time (legacy "Create A New
 * Tracker" wizard): what to track → reminders? → how/when → summary + save.
 */
export function NewTrackerForm({
  sms,
  timezone,
  taken,
}: {
  sms: SmsStatus;
  timezone: string;
  /** Preset kinds the participant already tracks. */
  taken: TrackerKind[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<TrackerKind | null>(null);
  const [label, setLabel] = useState("");
  const [wantsReminder, setWantsReminder] = useState<"yes" | "no" | null>(null);
  const [reminder, setReminder] = useState<ReminderSchedule>({ ...DEFAULT_SCHEDULE, enabled: true });
  const { executeAsync, isPending } = useAction(createTracker);

  const name = kind === "custom" ? label.trim() : (TRACKER_PRESETS.find((item) => item.kind === kind)?.label ?? "");
  const step1Done = kind !== null && name.length >= 2;
  const finalReminder = { ...reminder, enabled: wantsReminder === "yes" };
  const ready = step1Done && wantsReminder !== null && !smsBlocked(finalReminder, sms);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || !kind) return;
    const result = await executeAsync({ kind, label: kind === "custom" ? name : undefined, reminder: finalReminder });
    if (!result?.data) {
      toast.error(result?.serverError ?? (result?.validationErrors ? "Please check your answers." : "We couldn't save your tracker."));
      return;
    }
    toast.success(`You're now tracking ${name}`, {
      description: result.data.points.awarded ? `+${result.data.points.points} points. Keep on tracking!` : "Keep on tracking!",
    });
    router.push(`/tracker/personal/${result.data.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Step number={1} title="What would you like to track?" done={step1Done}>
        <ToggleGroupPrimitive.Root
          type="single"
          aria-label="What would you like to track?"
          value={kind ?? ""}
          onValueChange={(next) => {
            if (next) setKind(next as TrackerKind);
          }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {[...TRACKER_PRESETS.map((preset) => ({ kind: preset.kind, label: preset.label })), { kind: "custom" as const, label: "Something else" }].map(
            (option) => {
              const disabled = option.kind !== "custom" && taken.includes(option.kind);
              const active = kind === option.kind;
              return (
                <ToggleGroupPrimitive.Item
                  key={option.kind}
                  value={option.kind}
                  disabled={disabled}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45",
                    active ? "border-primary bg-secondary ring-1 ring-primary" : "bg-card hover:border-primary/30 hover:bg-secondary/60",
                  )}
                >
                  <TrackerIcon kind={option.kind} className="size-10 rounded-xl" />
                  {option.label}
                  {disabled ? <span className="-mt-1.5 text-xs font-normal text-muted-foreground">Already tracking</span> : null}
                </ToggleGroupPrimitive.Item>
              );
            },
          )}
        </ToggleGroupPrimitive.Root>

        <AnimatePresence initial={false}>
          {kind === "custom" ? (
            <motion.div {...reveal} className="overflow-hidden">
              <div className="space-y-2 pt-4">
                <Label htmlFor="tracker-label">Name what you want to track</Label>
                <Input
                  id="tracker-label"
                  value={label}
                  autoFocus
                  maxLength={60}
                  placeholder="e.g. Go for a walk"
                  onChange={(event) => setLabel(event.target.value)}
                  className="h-11 rounded-xl"
                />
                {label.trim().length >= 2 ? (
                  <p className="text-sm text-muted-foreground">
                    Each day we&apos;ll ask: <span className="text-foreground">{trackerQuestion("custom", label.trim())}</span>
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Step>

      <AnimatePresence initial={false}>
        {step1Done ? (
          <motion.div key="step2" {...reveal} className="overflow-hidden">
            <Step number={2} title="Would you like reminders?" done={wantsReminder !== null}>
              <Segmented
                label="Would you like reminders?"
                value={wantsReminder}
                onValueChange={setWantsReminder}
                options={[
                  { value: "yes", label: "Yes, remind me" },
                  { value: "no", label: "No thanks" },
                ]}
              />
              <AnimatePresence initial={false}>
                {wantsReminder === "yes" ? (
                  <motion.div {...reveal} className="overflow-hidden">
                    <div className="pt-6">
                      <ReminderFields
                        value={reminder}
                        onChange={setReminder}
                        sms={sms}
                        timezone={timezone}
                        textPlaceholder={kind ? trackerQuestion(kind, name) : ""}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Step>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {step1Done && wantsReminder !== null ? (
          <motion.div key="summary" {...reveal} className="overflow-hidden">
            <div className="rounded-2xl bg-secondary p-4 sm:p-5">
              <p className="text-[0.95rem] text-secondary-foreground">
                OK! You&apos;ll track <strong className="font-semibold">{name}</strong>
                {wantsReminder === "yes" ? (
                  <>
                    {" "}and get a reminder <strong className="font-semibold">{reminder.frequency === "weekly" ? `on ${describeWhen(reminder)}` : describeWhen(reminder).replace(/^E/, "e")}</strong>{" "}
                    {channelLabel(reminder.channel)}.
                  </>
                ) : (
                  <> without reminders. You can add one later.</>
                )}
              </p>
              <Button type="submit" disabled={!ready || isPending} className="mt-4 h-11 w-full rounded-full text-[0.95rem] sm:w-auto sm:px-6">
                {isPending ? <Spinner /> : <Check data-icon="inline-start" />}
                Save your tracker
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-3" aria-hidden>
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-xs font-bold transition-colors",
            done ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {done ? <Check className="size-4" strokeWidth={3} /> : number}
        </span>
        <p className="font-heading text-lg font-semibold">{title}</p>
      </div>
      {children}
    </fieldset>
  );
}

export function NewTrackerHint() {
  return (
    <p className="mb-4 flex items-start gap-2 text-sm text-muted-foreground">
      <PenLine className="mt-0.5 size-4 shrink-0" aria-hidden />
      You&apos;ll be asked once a day whether you did it. It only takes a tap.
    </p>
  );
}
