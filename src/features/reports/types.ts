/**
 * Serializable shapes passed from report queries to the report UI.
 * Client-safe (types only).
 */
import type { CsvCell } from "./format";

export type CellValue = string | number | boolean | null | string[];

/**
 * How a column renders:
 * - sid: study ID (monospace)        - text / longtext: plain / clamped text
 * - number: right-aligned count       - heat: count tinted by magnitude
 * - datetime / date: ISO → friendly   - duration: seconds, null = Incomplete
 * - list: string[] (expandable)       - flag: 1/0 as a check mark
 */
export type ColumnKind = "sid" | "text" | "longtext" | "number" | "heat" | "datetime" | "date" | "duration" | "list" | "flag";

export type ReportColumn = {
  id: string;
  label: string;
  kind: ColumnKind;
  /** Longer explanation shown on hover (e.g. the legacy header). */
  hint?: string;
  /** Pin to the left while scrolling sideways. */
  sticky?: boolean;
  /** Short label for very wide matrices. */
  short?: string;
};

export type ReportRow = { id: string } & Record<string, CellValue>;

export type ReportTile = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
};

export type ChartSeries = { key: string; label: string; color: "primary" | "chart-1" | "chart-3" | "chart-4" | "muted" };

export type ReportChart = {
  title: string;
  description?: string;
  /** Stacked when there are several series. */
  series: ChartSeries[];
  /** Each row has `label` (x axis) and one number per series key. */
  data: Record<string, string | number>[];
  /** Tooltip heading prefix, e.g. "Week of". */
  labelPrefix?: string;
};

export type CsvTable = { filename: string; rows: CsvCell[][] };

export type ReportLayout = "table" | "thread" | "checkin";

export type ReportView = {
  layout: ReportLayout;
  columns: ReportColumn[];
  rows: ReportRow[];
  tiles: ReportTile[];
  chart?: ReportChart;
  /** Columns the free-text search looks at. */
  searchKeys?: string[];
  initialSort?: { id: string; desc: boolean };
  /** Data caveats shown under the table ("how this is calculated"). */
  notes: string[];
  /**
   * Parts of the report the app doesn't record (yet): shown as "Not
   * recorded" instead of a made-up number.
   */
  gaps?: { label: string; detail: string }[];
  /** People in the chosen arm who have no study ID and so are left out. */
  missingSid?: number;
  /** Extra payload for custom layouts. */
  extra?: unknown;
};

export type ReportResult = { view: ReportView; csv: CsvTable };
