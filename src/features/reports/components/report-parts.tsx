import Link from "next/link";
import { CircleDashed, Info, UserRoundX } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "../format";
import type { ReportTile, ReportView } from "../types";

/** Summary numbers above a report. */
export function ReportTiles({ tiles }: { tiles: ReportTile[] }) {
  if (!tiles.length) return null;
  return (
    <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn(
            "min-w-0 rounded-2xl border bg-card px-4 py-3.5 shadow-soft",
            tile.tone === "warning" && "border-brand-apricot/60 bg-[color-mix(in_oklch,var(--brand-apricot)_10%,var(--card))]",
          )}
        >
          <dt className="truncate text-xs font-medium text-muted-foreground">{tile.label}</dt>
          <dd className="mt-1 font-heading text-2xl leading-none font-semibold tabular-nums">{tile.value}</dd>
          {tile.hint ? (
            <dd className="mt-1.5 truncate text-xs text-muted-foreground" title={tile.hint}>
              {tile.hint}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/** "N people have no study ID" — they can't appear in research reports until staff add one. */
export function MissingSidNotice({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <p className="mb-5 flex items-start gap-2.5 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
      <UserRoundX className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {formatNumber(count)} {count === 1 ? "person" : "people"} in this group {count === 1 ? "has" : "have"} no study ID, so they’re left out, as in the old
        reports.{" "}
        <Link href="/admin/users" className="font-medium underline underline-offset-2">
          Add study IDs in Users
        </Link>
      </span>
    </p>
  );
}

/** Data this report can't show because the app doesn't record it (yet). */
export function GapsNotice({ gaps }: { gaps: ReportView["gaps"] }) {
  if (!gaps?.length) return null;
  return (
    <section className="mb-5 rounded-2xl border border-dashed px-4 py-3.5" aria-label="Not recorded">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
        Not recorded yet
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {gaps.map((gap) => (
          <li key={gap.label}>
            <span className="font-medium text-foreground">{gap.label}.</span> {gap.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "How this is calculated": the report's caveats and legacy fixes. */
export function ReportNotes({ notes, filename, legacyLayout }: { notes: string[]; filename: string; legacyLayout: boolean }) {
  return (
    <section className="mt-6 rounded-2xl bg-muted/60 px-4 py-4 sm:px-5" aria-labelledby="report-notes">
      <h2 id="report-notes" className="flex items-center gap-2 text-sm font-semibold">
        <Info className="size-4 text-muted-foreground" aria-hidden />
        How this report is calculated
      </h2>
      <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground/50">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
        <li>
          The export is <span className="font-mono text-[0.8rem] text-foreground">{filename}</span>
          {legacyLayout ? " with the old column headers, order and date formats" : ""}, and follows the filters above.
        </li>
      </ul>
    </section>
  );
}
