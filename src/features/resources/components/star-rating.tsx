"use client";

import { Star } from "lucide-react";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { rateResourceAction } from "../actions";
import { actionError } from "../client";

const LABELS = ["", "Not helpful", "Could be better", "Okay", "Helpful", "Very helpful"];

/**
 * "Rate this resource" (Fivestar, re-rating allowed). A radio group so it
 * works with the keyboard; optimistic, with the new average from the server.
 */
export function StarRating({
  resourceId,
  mine,
  average,
  count,
}: {
  resourceId: string;
  mine: number | null;
  average: number;
  count: number;
}) {
  const [value, setValue] = useState(mine ?? 0);
  const [hover, setHover] = useState(0);
  const [stats, setStats] = useState({ average, count });
  const [pending, startTransition] = useTransition();
  const shown = hover || value;

  function rate(next: number) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await rateResourceAction({ resourceId, value: next });
      const error = actionError(result);
      if (error || !result?.data) {
        setValue(previous);
        toast.error(error ?? "Couldn't save your rating.");
        return;
      }
      setStats({ average: result.data.ratingAverage, count: result.data.ratingCount });
      toast.success(previous ? "Rating updated" : "Thanks for rating!");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        role="radiogroup"
        aria-label="Your rating"
        className="flex items-center"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <motion.button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? "s" : ""}: ${LABELS[star]}`}
            tabIndex={value ? (value === star ? 0 : -1) : star === 1 ? 0 : -1}
            disabled={pending}
            whileTap={{ scale: 0.8 }}
            onMouseEnter={() => setHover(star)}
            onFocus={() => setHover(star)}
            onBlur={() => setHover(0)}
            onClick={() => rate(star)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                event.preventDefault();
                rate(Math.min(5, (value || 0) + 1));
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault();
                rate(Math.max(1, (value || 2) - 1));
              }
            }}
            className="grid size-11 place-items-center rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Star
              aria-hidden
              className={cn(
                "size-7 transition-all",
                star <= shown ? "fill-brand-apricot text-brand-apricot" : "text-muted-foreground/40",
                star <= shown && hover ? "scale-110" : "",
              )}
            />
          </motion.button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shown ? (
          <span className="font-medium text-foreground">{LABELS[shown]}</span>
        ) : (
          "Tap a star to rate"
        )}
        {stats.count ? (
          <span>
            {" "}
            · {stats.average.toFixed(1)} average from {stats.count} {stats.count === 1 ? "rating" : "ratings"}
          </span>
        ) : null}
      </p>
    </div>
  );
}
