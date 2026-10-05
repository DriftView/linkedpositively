"use client";

import { Heart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleFavoriteAction } from "../actions";
import { actionError } from "../client";

/** Heart toggle for saving a resource. Optimistic; rolls back on error. */
export function FavoriteButton({
  resourceId,
  title,
  favorited,
  variant = "icon",
  className,
}: {
  resourceId: string;
  title: string;
  favorited: boolean;
  variant?: "icon" | "pill";
  className?: string;
}) {
  const [saved, setSaved] = useState(favorited);
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await toggleFavoriteAction({ resourceId, favorite: next });
      const error = actionError(result);
      if (error) toast.error(error);
      else setSaved(next);
      if (!error && next) toast.success("Saved to your resources", { description: title, action: { label: "View saved", onClick: () => router.push("/resources/saved") } });
    });
  }

  const icon = (
    <span className="relative grid place-items-center">
      <Heart
        aria-hidden
        className={cn("size-5 transition-colors", optimistic ? "fill-brand-magenta text-brand-magenta" : "text-muted-foreground")}
      />
      <AnimatePresence>
        {optimistic ? (
          <motion.span
            key="burst"
            aria-hidden
            className="absolute inset-0 rounded-full bg-brand-magenta/25"
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 2.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimistic}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]",
          optimistic ? "border-brand-magenta/30 bg-brand-magenta/10 text-brand-magenta" : "bg-card hover:bg-muted",
          className,
        )}
      >
        {icon}
        {optimistic ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={{ scale: 0.85 }}
      aria-pressed={optimistic}
      aria-label={optimistic ? `Remove ${title} from saved` : `Save ${title}`}
      className={cn(
        "relative z-10 grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-brand-magenta/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      {icon}
    </motion.button>
  );
}
