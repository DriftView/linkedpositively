"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ChartSeries, ReportChart as ReportChartData } from "../types";

const COLORS: Record<ChartSeries["color"], string> = {
  primary: "var(--color-primary)",
  "chart-1": "var(--chart-1)",
  "chart-3": "var(--chart-3)",
  "chart-4": "var(--chart-4)",
  muted: "var(--muted-foreground)",
};

/** Bar chart of a report's weekly (or per-category) counts; stacked when there are several series. */
export function ReportChart({ chart }: { chart: ReportChartData }) {
  const config = Object.fromEntries(chart.series.map((s) => [s.key, { label: s.label, color: COLORS[s.color] }])) satisfies ChartConfig;
  const stacked = chart.series.length > 1;
  const dense = chart.data.length > 30;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5" aria-label={chart.title}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">{chart.title}</h2>
        {chart.description ? <p className="text-sm text-muted-foreground">{chart.description}</p> : null}
      </div>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={chart.data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap={dense ? 1 : 4}>
          <CartesianGrid vertical={false} className="stroke-border/60" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} fontSize={11} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} fontSize={11} />
          <ChartTooltip
            cursor={{ className: "fill-muted/60" }}
            content={<ChartTooltipContent labelFormatter={(label) => (chart.labelPrefix ? `${chart.labelPrefix} ${label}` : String(label))} />}
          />
          {stacked ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {chart.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId={stacked ? "a" : undefined}
              fill={`var(--color-${s.key})`}
              radius={!stacked || i === chart.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </section>
  );
}
