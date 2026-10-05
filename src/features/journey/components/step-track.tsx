import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOURNEY_STEPS } from "../steps";

/** Seven-dot progress track (the old "my journey" step tab bar). */
export function StepTrack({ step, className }: { step: number; className?: string }) {
  return (
    <div className={cn("relative", className)} role="img" aria-label={`Step ${step} of 7: ${JOURNEY_STEPS[step - 1]}`}>
      <div aria-hidden className="absolute top-1/2 right-2 left-2 h-1 -translate-y-1/2 rounded-full bg-muted" />
      <div
        aria-hidden
        className="absolute top-1/2 left-2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary to-brand-magenta transition-[width] duration-500"
        style={{ width: `calc((100% - 1rem) * ${(step - 1) / 6})` }}
      />
      <ol aria-hidden className="relative flex justify-between">
        {JOURNEY_STEPS.map((label, index) => {
          const n = index + 1;
          const done = n < step || step === 7;
          const current = n === step && step < 7;
          return (
            <li
              key={label}
              className={cn(
                "grid size-4 place-items-center rounded-full border-2 bg-card transition-all duration-300",
                done && "border-transparent bg-primary text-primary-foreground",
                current && "size-5 border-brand-magenta ring-4 ring-brand-magenta/15",
                !done && !current && "border-border",
              )}
            >
              {done ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
