"use client";

import { motion } from "motion/react";
import { Check, HeartHandshake, Pill, Syringe, Target, X } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { checkInTracker } from "../actions";
import type { TrackerKind } from "../types";

const KIND_STYLE: Record<TrackerKind, { icon: typeof Pill; className: string }> = {
  prep: { icon: Pill, className: "bg-brand-sky/20 text-primary dark:bg-brand-sky/15 dark:text-brand-sky" },
  hormones: { icon: Syringe, className: "bg-brand-pink/25 text-brand-magenta dark:bg-brand-pink/15 dark:text-brand-pink" },
  sex: { icon: HeartHandshake, className: "bg-brand-magenta/12 text-brand-magenta dark:bg-brand-magenta/20" },
  custom: { icon: Target, className: "bg-brand-apricot/25 text-foreground dark:bg-brand-apricot/15 dark:text-brand-apricot" },
};

export function TrackerIcon({ kind, className }: { kind: TrackerKind; className?: string }) {
  const style = KIND_STYLE[kind];
  const Icon = style.icon;
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", style.className, className)} aria-hidden>
      <Icon className="size-5" />
    </span>
  );
}

/**
 * Today's yes/no answer for a personal tracker, saved optimistically.
 * Returns the value, a setter that saves, and the last points award.
 */
export function useTrackerCheckin(trackerId: string, initial: boolean | null) {
  const [value, setValue] = useState(initial);
  const [burst, setBurst] = useState<{ points: number | null; key: number }>({ points: null, key: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { executeAsync, isPending } = useAction(checkInTracker);

  async function answer(done: boolean) {
    const previous = value;
    setValue(done);
    const result = await executeAsync({ trackerId, done });
    if (!result?.data) {
      setValue((current) => (current === done ? previous : current));
      toast.error(result?.serverError ?? "We couldn't save that. Please try again.");
      return;
    }
    if (result.data.points.awarded && result.data.points.points) {
      clearTimeout(timer.current);
      setBurst((current) => ({ points: result.data!.points.points!, key: current.key + 1 }));
      timer.current = setTimeout(() => setBurst((current) => ({ ...current, points: null })), 2600);
    }
  }
  return { value, answer, burst, isPending };
}

/** Yes / No pills. `size="lg"` for the tracker page, default for list rows. */
export function YesNo({
  value,
  onChange,
  label,
  size = "default",
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  label: string;
  size?: "default" | "lg";
}) {
  const current = value === null ? "" : value ? "yes" : "no";
  const options = [
    { key: "yes", text: "Yes", icon: Check, on: "bg-success text-success-foreground" },
    { key: "no", text: "No", icon: X, on: "bg-primary text-primary-foreground" },
  ] as const;
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={label}
      value={current}
      onValueChange={(next) => {
        if (next && next !== current) onChange(next === "yes");
      }}
      className={cn("grid grid-cols-2", size === "lg" ? "gap-2.5" : "gap-1.5")}
    >
      {options.map((option) => {
        const active = current === option.key;
        const Icon = option.icon;
        return (
          <ToggleGroupPrimitive.Item
            key={option.key}
            value={option.key}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-full border font-semibold transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
              size === "lg" ? "h-13 text-[0.95rem]" : "h-10 min-w-[4.5rem] px-3 text-sm",
              active ? cn("border-transparent shadow-soft", option.on) : "border-border bg-card hover:border-primary/30 hover:bg-secondary",
            )}
          >
            <motion.span animate={active ? { scale: [1, 1.35, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}>
              <Icon className={size === "lg" ? "size-4.5" : "size-4"} strokeWidth={2.6} aria-hidden />
            </motion.span>
            {option.text}
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
