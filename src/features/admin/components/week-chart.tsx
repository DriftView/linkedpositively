"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = { count: { label: "Participants", color: "var(--color-primary)" } } satisfies ChartConfig;

/** Participants per study week (1–24): where the cohort is in the program. */
export function WeekChart({ weeks }: { weeks: { week: number; count: number }[] }) {
  const data = weeks.map((row) => ({ ...row, label: `Wk ${row.week}` }));
  return (
    <ChartContainer config={config} className="aspect-auto h-52 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="0" className="stroke-border/60" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} interval={1} fontSize={11} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} fontSize={11} />
        <ChartTooltip
          cursor={{ className: "fill-muted/60" }}
          content={<ChartTooltipContent labelFormatter={(_, payload) => `Week ${payload?.[0]?.payload?.week ?? ""}`} />}
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}
