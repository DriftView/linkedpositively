"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { recordTipView } from "../actions";

/** Tips already reported in this browser session (avoids duplicate calls). */
const reported = new Set<string>();

/**
 * Records that the viewer read a tip once it has been on screen for `dwellMs`
 * (so quickly swiping past doesn't count), and celebrates the points.
 */
export function useTipView(tipId: string | null | undefined, { active = true, enabled = true, dwellMs = 1200 } = {}) {
  useEffect(() => {
    if (!tipId || !active || !enabled || reported.has(tipId)) return;
    const timer = window.setTimeout(async () => {
      if (reported.has(tipId)) return;
      reported.add(tipId);
      const result = await recordTipView({ tipId });
      const points = result?.data?.points ?? 0;
      if (points > 0) {
        toast.success(`+${points} points`, {
          description: result?.data?.recommended ? "You read a tip picked for you." : "Thanks for reading today's tip.",
          duration: 2600,
        });
      }
    }, dwellMs);
    return () => window.clearTimeout(timer);
  }, [tipId, active, enabled, dwellMs]);
}

/** Drop-in for pages that show a single tip. */
export function TipViewTracker({ tipId, enabled }: { tipId: string; enabled: boolean }) {
  useTipView(tipId, { enabled, dwellMs: 800 });
  return null;
}
