"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { acknowledgeLevelUp } from "../actions";
import { ConfettiBurst } from "./confetti-burst";

// Only one celebration per page, even if the component is mounted twice
// (e.g. by the layout and a page).
let claimed = false;

/**
 * Celebrates a level-up the participant hasn't seen yet: a short confetti
 * burst and the level's promise. Closing it marks the level as celebrated.
 */
export function LevelUpCelebration({ pending }: { pending: { level: number; headline: string } | null }) {
  const [open, setOpen] = useState(false);
  const { execute } = useAction(acknowledgeLevelUp);

  useEffect(() => {
    if (!pending || claimed) return;
    claimed = true;
    const timer = setTimeout(() => setOpen(true), 450);
    return () => {
      clearTimeout(timer);
      claimed = false;
    };
  }, [pending]);

  if (!pending) return null;

  function close() {
    setOpen(false);
    execute({ level: pending!.level });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="overflow-visible rounded-3xl p-0 sm:max-w-sm" showCloseButton={false}>
        <div className="relative overflow-hidden rounded-3xl">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklch,var(--brand-magenta)_30%,transparent),transparent_70%)]" />
          <div className="relative flex flex-col items-center px-6 pt-9 pb-6 text-center">
            <div className="relative">
              {open ? <ConfettiBurst seed={pending.level} /> : null}
              <motion.div
                initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
                className="relative grid size-28 place-items-center rounded-full bg-gradient-to-br from-brand-magenta to-primary text-primary-foreground shadow-lift"
              >
                <span className="absolute inset-1.5 rounded-full border-2 border-white/35" />
                <span className="flex flex-col items-center leading-none text-white">
                  <span className="text-[0.62rem] font-semibold tracking-[0.18em] uppercase opacity-85">Level</span>
                  <span className="mt-1 font-heading text-5xl font-bold tabular-nums">{pending.level}</span>
                </span>
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand-magenta/10 px-3 py-1 text-xs font-semibold text-brand-magenta dark:bg-brand-magenta/20">
                <Sparkles className="size-3.5" /> Level up!
              </p>
              <DialogTitle className="mt-3 text-2xl font-semibold">You reached Level {pending.level}</DialogTitle>
              <DialogDescription className="mt-2 text-[0.95rem] text-muted-foreground">
                {pending.headline || "Keep it up — every visit, post and tip counts."}
              </DialogDescription>
            </motion.div>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button asChild size="lg" className="h-11 rounded-full text-[0.95rem]" onClick={close}>
                <Link href="/levels">
                  See what you unlocked <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button variant="ghost" size="lg" className="h-11 rounded-full" onClick={close}>
                Nice, thanks!
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
