import { Check } from "lucide-react";
import { formatInZone } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { clockDuration, formatNumber, REPORT_TIMEZONE } from "../format";
import type { CellValue, ColumnKind } from "../types";

/** Background tint for a count relative to the column's largest value. */
export function heatStyle(value: number, max: number): React.CSSProperties | undefined {
  if (!value || !max) return undefined;
  const strength = Math.round(6 + (value / max) * 30);
  return { backgroundColor: `color-mix(in oklch, var(--primary) ${strength}%, transparent)` };
}

/** Right-aligned kinds (numbers line up). */
export function isNumeric(kind: ColumnKind) {
  return kind === "number" || kind === "heat" || kind === "duration" || kind === "flag";
}

function ListCell({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  if (items.length === 1) return <span className="line-clamp-2 min-w-48">{items[0]}</span>;
  return (
    <details className="group min-w-56 max-w-md">
      <summary className="cursor-pointer list-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="line-clamp-1 group-open:hidden">{items[0]}</span>
        <span className="mt-0.5 inline-block text-xs font-medium text-primary group-open:hidden">+{items.length - 1} more</span>
        <span className="hidden text-xs font-medium text-primary group-open:inline">Show less</span>
      </summary>
      <ol className="mt-1.5 space-y-1.5 border-l-2 border-primary/20 pl-3">
        {items.map((item, i) => (
          <li key={i} className="text-[0.8rem] leading-snug">
            {item}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Renders one report cell by its column kind. */
export function Cell({ kind, value }: { kind: ColumnKind; value: CellValue }) {
  switch (kind) {
    case "sid":
      return value ? <span className="font-mono text-[0.8rem] font-medium">{String(value)}</span> : <span className="text-muted-foreground">—</span>;
    case "number":
    case "heat":
      return typeof value === "number" ? <span className={cn(value === 0 && "text-muted-foreground/70")}>{formatNumber(value, 1)}</span> : <span className="text-muted-foreground">—</span>;
    case "flag":
      return value === 1 || value === true ? (
        <Check className="ml-auto size-3.5 text-primary" aria-label="Yes" />
      ) : (
        <span className="text-muted-foreground/50" aria-label="No">
          ·
        </span>
      );
    case "duration":
      return typeof value === "number" ? (
        <span>{clockDuration(value)}</span>
      ) : (
        <span className="text-muted-foreground italic" title="No sign-out was recorded for this session">
          Incomplete
        </span>
      );
    case "datetime":
      return typeof value === "string" && value ? (
        <span className="whitespace-nowrap" title={formatInZone(value, "EEEE, MMM d, yyyy h:mm:ss a '(Eastern)'", REPORT_TIMEZONE)}>
          {formatInZone(value, "MMM d, yyyy · h:mm a", REPORT_TIMEZONE)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "date":
      return typeof value === "string" && value ? (
        <span className="whitespace-nowrap">{formatInZone(value, "MMM d, yyyy", REPORT_TIMEZONE)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "list":
      return <ListCell items={Array.isArray(value) ? value : []} />;
    case "longtext":
      return <span className="line-clamp-2 min-w-56 max-w-md">{String(value ?? "")}</span>;
    default:
      return value === null || value === "" ? <span className="text-muted-foreground">—</span> : <span>{String(value)}</span>;
  }
}
