/**
 * Report filters, read from and written to the URL so a filtered view can be
 * bookmarked and its CSV link carries the same filters. Client-safe.
 */
import { addDays, format, parseISO } from "date-fns";
import { z } from "zod";
import { REPORT_TIMEZONE } from "./format";
import { formatInZone } from "@/lib/dates";
import { fromZonedDay } from "./zone";

export const ARMS = ["participant", "control", "study", "everyone"] as const;
export type Arm = (typeof ARMS)[number];

export const ARM_LABELS: Record<Arm, string> = {
  participant: "Intervention",
  control: "Control",
  study: "Both arms",
  everyone: "Everyone",
};

export type ReportFilters = {
  /** Inclusive local days ("yyyy-MM-dd", report timezone). */
  from?: string;
  to?: string;
  /** Study ID contains (case-insensitive). */
  sid?: string;
  arm: Arm;
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()));

const schema = z.object({
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  sid: z.string().trim().max(60).optional().catch(undefined),
  arm: z.enum(ARMS).optional().catch(undefined),
});

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, key: string) {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Parses filters; `defaultArm` is the population the legacy report covered. */
export function parseFilters(params: Params, defaultArm: Arm = "participant"): ReportFilters {
  const parsed = schema.parse({
    from: read(params, "from") || undefined,
    to: read(params, "to") || undefined,
    sid: read(params, "sid") || undefined,
    arm: read(params, "arm") || undefined,
  });
  let { from, to } = parsed;
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to, sid: parsed.sid || undefined, arm: parsed.arm ?? defaultArm };
}

/** Query string for the filters (omits defaults). */
export function filtersQuery(filters: ReportFilters, defaultArm: Arm = "participant") {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sid) params.set("sid", filters.sid);
  if (filters.arm !== defaultArm) params.set("arm", filters.arm);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** [start, end) instants of the filter's day range in the report timezone. */
export function filterRange(filters: Pick<ReportFilters, "from" | "to">, timezone = REPORT_TIMEZONE) {
  return {
    start: filters.from ? fromZonedDay(filters.from, timezone) : undefined,
    end: filters.to ? fromZonedDay(format(addDays(parseISO(filters.to), 1), "yyyy-MM-dd"), timezone) : undefined,
  };
}

export const PRESETS = [
  { id: "all", label: "All time", days: null },
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
] as const;

/** Day range of a "last N days" preset ending today (report timezone). */
export function presetRange(days: number, now = new Date()) {
  const today = formatInZone(now, "yyyy-MM-dd", REPORT_TIMEZONE);
  return { from: format(addDays(parseISO(today), -(days - 1)), "yyyy-MM-dd"), to: today };
}

/** "Sep 1 – Sep 29, 2026", "Since Sep 1, 2026", "All time". */
export function describeRange(filters: Pick<ReportFilters, "from" | "to">) {
  const nice = (value: string) => format(parseISO(value), "MMM d, yyyy");
  if (filters.from && filters.to) return `${nice(filters.from)} – ${nice(filters.to)}`;
  if (filters.from) return `Since ${nice(filters.from)}`;
  if (filters.to) return `Until ${nice(filters.to)}`;
  return "All time";
}
