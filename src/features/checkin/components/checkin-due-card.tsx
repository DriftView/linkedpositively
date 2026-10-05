import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import type { Viewer } from "@/server/auth/session";
import { weeklyCheckinDue } from "../queries";

/**
 * <CheckinDueCard viewer={viewer} /> — server component for the home page:
 * "It's time for your weekly check-in!" while the viewer's check-in is open
 * and unanswered (the old `twm_weekly_checkin` block). Renders nothing
 * otherwise.
 */
export async function CheckinDueCard({ viewer, className }: { viewer: Viewer; className?: string }) {
  const due = await weeklyCheckinDue(viewer);
  if (!due) return null;
  return (
    <Link
      href="/check-in"
      className={`group flex items-center gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-secondary to-card p-4 shadow-soft transition hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${className ?? ""}`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ClipboardCheck className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading font-semibold">It&apos;s time for your weekly check-in!</span>
        <span className="block text-sm text-muted-foreground">Look back at week {due.week} — it takes about two minutes.</span>
      </span>
      <ArrowRight className="size-5 text-primary transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
