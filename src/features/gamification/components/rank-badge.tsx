import { cn } from "@/lib/utils";

const MEDALS: Record<number, string> = {
  1: "bg-gradient-to-br from-[oklch(0.9_0.13_88)] to-[oklch(0.78_0.15_70)] text-[oklch(0.32_0.07_60)] shadow-sm",
  2: "bg-gradient-to-br from-[oklch(0.94_0.008_300)] to-[oklch(0.8_0.015_300)] text-[oklch(0.32_0.02_300)] shadow-sm",
  3: "bg-gradient-to-br from-[oklch(0.84_0.07_55)] to-[oklch(0.68_0.1_48)] text-[oklch(0.26_0.05_50)] shadow-sm",
};

/** Rank number; the top three get gold, silver and bronze discs. */
export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
        MEDALS[rank] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}
