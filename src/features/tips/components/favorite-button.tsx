"use client";

import { Heart } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleFavoriteTip } from "../actions";

/**
 * Heart toggle for a tip. Optimistic: the heart fills immediately and rolls
 * back with a toast if saving fails.
 */
export function FavoriteButton({
  tipId,
  title,
  favorited,
  onChange,
  className,
}: {
  tipId: string;
  title: string;
  favorited: boolean;
  onChange?: (favorite: boolean) => void;
  className?: string;
}) {
  // `saved` is the confirmed state; `optimistic` shows the pending one.
  const [saved, setSaved] = useState(favorited);
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();
  const reduce = useReducedMotion();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await toggleFavoriteTip({ tipId, favorite: next });
      if (result?.serverError || result?.validationErrors) {
        toast.error(result.serverError ?? "Couldn't update your favourites.");
        return;
      }
      setSaved(next);
      onChange?.(next);
      toast.success(next ? "Saved to your favourites" : "Removed from favourites", { duration: 1800 });
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={optimistic}
      aria-label={optimistic ? `Remove “${title}” from favourites` : `Save “${title}” to favourites`}
      className={cn(
        "group/fav relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        optimistic
          ? "bg-brand-magenta/10 text-brand-magenta dark:bg-brand-magenta/20"
          : "text-muted-foreground hover:bg-muted hover:text-brand-magenta",
        className,
      )}
    >
      <motion.span
        key={optimistic ? "on" : "off"}
        initial={reduce ? false : { scale: optimistic ? 0.6 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 520, damping: 14 }}
        className="inline-flex"
      >
        <Heart className={cn("size-5", optimistic && "fill-current")} strokeWidth={2} />
      </motion.span>
      {optimistic && !reduce ? (
        <motion.span
          key="burst"
          aria-hidden
          initial={{ opacity: 0.5, scale: 0.6 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand-magenta/60"
        />
      ) : null}
    </button>
  );
}
