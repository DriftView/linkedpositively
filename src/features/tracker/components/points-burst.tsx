"use client";

import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";

/** A small "+2" chip that floats up when points are earned. Change `burstKey` to replay. */
export function PointsBurst({ points, burstKey }: { points: number | null; burstKey: number }) {
  return (
    <span className="pointer-events-none relative inline-flex h-7 items-center" aria-live="polite">
      <AnimatePresence>
        {points ? (
          <motion.span
            key={burstKey}
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="inline-flex items-center gap-1 rounded-full bg-brand-apricot/25 px-2.5 py-1 text-xs font-semibold text-foreground tabular-nums dark:bg-brand-apricot/20"
          >
            <Sparkles className="size-3.5 text-brand-magenta" aria-hidden />+{points} points
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
