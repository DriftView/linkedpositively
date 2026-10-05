"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleCheck, Pencil, X } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveCheckin } from "../actions";
import { MOODS, moodFor } from "../moods";
import type { TodayCheckin } from "../types";
import { MoodFace } from "./mood-face";
import { PointsBurst } from "./points-burst";
import { publishToday } from "./today-store";

/**
 * The daily check-in: "Did you take your meds today?" + "How are you feeling?"
 * Every tap saves instantly (optimistic) and can be changed all day.
 * `compact` (home page) folds into a one-line summary once both are answered.
 */
export function DailyCheckin({ initial, compact = false }: { initial: TodayCheckin; compact?: boolean }) {
  const [answers, setAnswers] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [burst, setBurst] = useState<{ points: number | null; key: number }>({ points: null, key: 0 });
  const burstTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { executeAsync } = useAction(saveCheckin);

  const done = answers.meds !== null && answers.mood !== null;
  const folded = compact && done && !editing;

  async function save(patch: { meds?: boolean; mood?: number }) {
    const previous = answers;
    const next = { ...answers, ...patch };
    setAnswers(next);
    publishToday(next);

    const result = await executeAsync(patch);
    if (!result?.data) {
      // Roll back only if nothing newer was chosen meanwhile.
      setAnswers((current) => (current.meds === next.meds && current.mood === next.mood ? previous : current));
      publishToday(previous);
      toast.error(result?.serverError ?? "We couldn't save that. Please try again.");
      return;
    }
    const saved = result.data.today;
    if (saved.day !== next.day) {
      setAnswers(saved); // the day rolled over while the page was open
      publishToday(saved);
    }
    if (result.data.points.awarded && result.data.points.points) {
      clearTimeout(burstTimer.current);
      setBurst((current) => ({ points: result.data!.points.points!, key: current.key + 1 }));
      burstTimer.current = setTimeout(() => setBurst((current) => ({ ...current, points: null })), 2600);
    }
    if (compact && next.meds !== null && next.mood !== null && patch.mood !== undefined) setEditing(false);
  }

  const mood = moodFor(answers.mood);

  return (
    <div>

      <AnimatePresence mode="popLayout" initial={false}>
        {folded ? (
          <motion.div
            key="folded"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-3.5"
          >
            <motion.div
              initial={{ scale: 0.6, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 16 }}
              className="grid size-13 shrink-0 place-items-center rounded-full bg-secondary"
            >
              <MoodFace mood={answers.mood!} size={40} />
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Checked in for today</p>
              <p className="text-sm text-muted-foreground">
                {answers.meds ? "Took meds" : "Missed meds"} · Feeling {mood?.label.toLowerCase()}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-10 rounded-full px-3.5" onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="open"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-6"
          >
            <MedsQuestion value={answers.meds} onChange={(meds) => save({ meds })} />
            <MoodQuestion value={answers.mood} onChange={(value) => save({ mood: value })} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("flex items-center justify-between gap-3", folded ? "min-h-0" : "mt-4 min-h-7")}>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
          {folded ? null : done ? (
            <>
              <CircleCheck className="size-4 text-success" aria-hidden />
              All done for today. You can change your answers until midnight.
            </>
          ) : answers.meds !== null || answers.mood !== null ? (
            "One more to go."
          ) : (
            "Two quick taps. Your answers save as you go."
          )}
        </p>
        <PointsBurst points={burst.points} burstKey={burst.key} />
      </div>
    </div>
  );
}

function MedsQuestion({ value, onChange }: { value: boolean | null; onChange: (value: boolean) => void }) {
  const options = [
    { key: "yes", label: "Yes, I did", icon: Check, on: "bg-success text-success-foreground shadow-soft" },
    { key: "no", label: "Not today", icon: X, on: "bg-primary text-primary-foreground shadow-soft" },
  ] as const;
  const current = value === null ? "" : value ? "yes" : "no";
  return (
    <fieldset>
      <legend className="mb-3 font-heading text-lg font-semibold">Did you take your meds today?</legend>
      <ToggleGroupPrimitive.Root
        type="single"
        value={current}
        onValueChange={(next) => {
          if (next && next !== current) onChange(next === "yes");
        }}
        aria-label="Did you take your meds today?"
        className="grid grid-cols-2 gap-2.5"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = current === option.key;
          return (
            <ToggleGroupPrimitive.Item
              key={option.key}
              value={option.key}
              className={cn(
                "group flex h-13 items-center justify-center gap-2 rounded-full border text-[0.95rem] font-semibold transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                active ? cn("border-transparent", option.on) : "border-border bg-card hover:border-primary/30 hover:bg-secondary",
              )}
            >
              <motion.span
                animate={active ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.35 }}
                className={cn(
                  "grid size-6 place-items-center rounded-full",
                  active ? "bg-white/20" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" strokeWidth={2.6} aria-hidden />
              </motion.span>
              {option.label}
            </ToggleGroupPrimitive.Item>
          );
        })}
      </ToggleGroupPrimitive.Root>
      <AnimatePresence initial={false}>
        {value !== null ? (
          <motion.p
            key={String(value)}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-2.5 text-sm text-muted-foreground"
          >
            {value ? "Nice work. Every dose counts." : "Thanks for being honest. Tomorrow is a fresh start."}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </fieldset>
  );
}

function MoodQuestion({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3 font-heading text-lg font-semibold">How are you feeling today?</legend>
      <ToggleGroupPrimitive.Root
        type="single"
        value={value ? String(value) : ""}
        onValueChange={(next) => {
          if (next && Number(next) !== value) onChange(Number(next));
        }}
        aria-label="How are you feeling today?"
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2"
      >
        {MOODS.map((mood) => {
          const active = value === mood.value;
          return (
            <ToggleGroupPrimitive.Item
              key={mood.value}
              value={String(mood.value)}
              aria-label={mood.label}
              className={cn(
                "group relative flex flex-col items-center gap-1.5 rounded-2xl px-1 pt-2.5 pb-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-secondary" : "hover:bg-muted/70",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="mood-ring"
                  className="absolute inset-0 rounded-2xl ring-2 ring-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              ) : null}
              <motion.span
                animate={active ? { scale: 1.12, y: -1 } : { scale: 1, y: 0 }}
                whileHover={{ scale: active ? 1.12 : 1.06 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
                className={cn(
                  "relative transition-[filter,opacity] duration-200",
                  value !== null && !active && "opacity-60 saturate-[0.7] group-hover:opacity-100 group-hover:saturate-100 dark:opacity-65 dark:saturate-100",
                )}
              >
                <MoodFace mood={mood.value} size={48} />
              </motion.span>
              <span
                className={cn(
                  "relative text-xs leading-none",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {mood.label}
              </span>
            </ToggleGroupPrimitive.Item>
          );
        })}
      </ToggleGroupPrimitive.Root>
    </fieldset>
  );
}
