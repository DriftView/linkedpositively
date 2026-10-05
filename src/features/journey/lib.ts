export { JOURNEY_STEPS } from "./steps";

export const ACCENTS = {
  plum: { tile: "bg-secondary text-primary", ring: "ring-primary/25", bar: "bg-primary", soft: "from-secondary" },
  magenta: { tile: "bg-brand-magenta/12 text-brand-magenta", ring: "ring-brand-magenta/25", bar: "bg-brand-magenta", soft: "from-brand-magenta/10" },
  sky: { tile: "bg-brand-sky/18 text-foreground", ring: "ring-brand-sky/40", bar: "bg-brand-sky", soft: "from-brand-sky/15" },
  apricot: { tile: "bg-brand-apricot/25 text-foreground", ring: "ring-brand-apricot/50", bar: "bg-brand-apricot", soft: "from-brand-apricot/20" },
  pink: { tile: "bg-brand-pink/25 text-foreground", ring: "ring-brand-pink/50", bar: "bg-brand-pink", soft: "from-brand-pink/20" },
} as const;

export const DEADLINES = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
] as const;

/** "YYYY-MM-DD", `days` from now in the browser's calendar. */
export function isoDateFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysUntil(iso: string) {
  const target = new Date(iso);
  const today = new Date();
  const a = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function deadlineLabel(iso: string | null) {
  if (!iso) return null;
  const days = daysUntil(iso);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return "Due tomorrow";
  if (days === 0) return "Due today";
  return "Past your target date";
}
