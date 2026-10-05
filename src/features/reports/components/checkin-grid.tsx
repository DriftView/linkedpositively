"use client";

import { useMemo, useState } from "react";
import { MOODS } from "@/features/tracker/moods";
import { formatInZone } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { formatNumber, percent, REPORT_TIMEZONE } from "../format";
import type { CheckinStrip } from "../queries/tracking";

const MED_CLASS: Record<string, string> = {
  Y: "bg-primary",
  N: "bg-brand-apricot",
  "?": "bg-muted-foreground/35",
  "-": "bg-muted-foreground/10",
  " ": "bg-transparent outline outline-1 -outline-offset-1 outline-border/60",
};
const MED_LABEL: Record<string, string> = { Y: "Took meds", N: "Missed meds", "?": "Checked in, no meds answer", "-": "No check-in", " ": "Not reached yet" };

const TONE_CLASS = { bright: "bg-chart-3", steady: "bg-muted-foreground/40", low: "bg-brand-magenta" } as const;
const moodOf = new Map(MOODS.map((m) => [m.value, m]));

const STEP = 30;

function Legend() {
  const swatch = (className: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-[2px]", className)} aria-hidden />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Meds</span>
      {swatch(MED_CLASS.Y, "Took")}
      {swatch(MED_CLASS.N, "Missed")}
      {swatch(MED_CLASS["?"], "No answer")}
      {swatch(MED_CLASS["-"], "No check-in")}
      {swatch(MED_CLASS[" "], "Not yet")}
      <span className="ml-2 font-medium text-foreground">Mood</span>
      {swatch(TONE_CLASS.bright, "Upbeat")}
      {swatch(TONE_CLASS.steady, "Steady")}
      {swatch(TONE_CLASS.low, "Low")}
    </div>
  );
}

/**
 * The check-in report on screen: one strip per participant with a cell per
 * study day (meds on top, mood below). The export has the full 150-day grid.
 */
export function CheckinGrid({ strips, days }: { strips: CheckinStrip[]; days: number }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(STEP);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? strips.filter((s) => s.sid.toLowerCase().includes(needle)) : strips;
  }, [strips, query]);

  if (!strips.length) return null;
  const weeks = Math.ceil(days / 7);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <label className="w-full max-w-xs">
          <span className="sr-only">Filter participants</span>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by study ID…" className="h-9" />
        </label>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th scope="col" className="sticky left-0 z-10 bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] px-4 py-2 font-medium">
                Participant SID
              </th>
              <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                Start
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                <div className="grid" style={{ gridTemplateColumns: `repeat(${weeks}, 41px)`, columnGap: "6px" }}>
                  {Array.from({ length: weeks }, (_, i) => (
                    <span key={i} className="text-[0.65rem] tabular-nums">
                      {i % 2 === 0 ? `W${i + 1}` : ""}
                    </span>
                  ))}
                </div>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                Took meds
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                Moods
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.slice(0, shown).map((strip) => (
              <tr key={strip.id} className="hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-card px-4 py-2 font-mono text-[0.8rem] font-medium">{strip.sid}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{formatInZone(strip.start, "MMM d, yyyy", REPORT_TIMEZONE)}</td>
                <td className="px-3 py-2">
                  <div
                    className="grid gap-y-[2px]"
                    style={{ gridTemplateColumns: `repeat(${weeks}, auto)`, columnGap: "6px", width: "max-content" }}
                    role="img"
                    aria-label={`${strip.sid}: ${strip.taken} of ${strip.reported} days answered took meds, ${strip.moodCount} moods`}
                  >
                    {Array.from({ length: weeks }, (_, w) => (
                      <div key={w} className="grid grid-cols-7 gap-px">
                        {Array.from({ length: 7 }, (_, d) => {
                          const i = w * 7 + d;
                          if (i >= days) return <span key={d} />;
                          const med = strip.meds[i] ?? " ";
                          const mood = moodOf.get(strip.moods[i] ?? 0);
                          return (
                            <span key={d} className="grid gap-px" title={`Day ${i + 1}: ${MED_LABEL[med]}${mood ? ` · ${mood.label}` : ""}`}>
                              <span className={cn("h-3 w-[5px] rounded-[1px]", MED_CLASS[med])} />
                              <span className={cn("h-1.5 w-[5px] rounded-[1px]", mood ? TONE_CLASS[mood.tone] : "bg-transparent")} />
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {percent(strip.taken, strip.reported)}
                  <span className="block text-xs text-muted-foreground">
                    {formatNumber(strip.taken)}/{formatNumber(strip.reported)} days
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(strip.moodCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No study ID contains “{query}”.</p> : null}
      </div>
      {visible.length > shown ? (
        <div className="border-t px-4 py-3 text-center">
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setShown((n) => n + STEP)}>
            Show {Math.min(STEP, visible.length - shown)} more participants
          </button>
        </div>
      ) : null}
    </div>
  );
}
