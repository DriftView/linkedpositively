/**
 * Pure, client-safe helpers for Peer Navigation (labels, report formats).
 * Kept free of server imports so they can be unit-tested and used in client components.
 */
import { formatInZone } from "@/lib/dates";
import { METHODS_OF_CONTACT } from "./curriculum";

export type SessionStatus = "not_started" | "in_progress" | "complete";

export const STATUS_LABELS: Record<SessionStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
};

/** Label of the coach's action button for a session (legacy Start / Resume / Completed). */
export function sessionActionLabel(status: SessionStatus) {
  if (status === "complete") return "Completed";
  if (status === "in_progress") return "Resume";
  return "Start";
}

export function methodLabel(method: string | null | undefined) {
  return METHODS_OF_CONTACT.find((m) => m.key === method)?.label ?? null;
}

/**
 * Session length for the usage report (legacy `ecoach_standard_usage_report`):
 * "1 hour 5 seconds", "2 minutes", "0 seconds", or "Incomplete" when no
 * logout was observed.
 */
export function usageDuration(loginAt: Date | string, logoutAt: Date | string | null | undefined) {
  if (!logoutAt) return "Incomplete";
  const seconds = Math.floor((new Date(logoutAt).getTime() - new Date(loginAt).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "Incomplete";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? "1 hour" : `${h} hours`);
  if (m) parts.push(m === 1 ? "1 minute" : `${m} minutes`);
  if (s || parts.length === 0) parts.push(s === 1 ? "1 second" : `${s} seconds`);
  return parts.join(" ");
}

/** Short time zone name ("EDT", "EST") like PHP's `T`. */
export function zoneAbbreviation(date: Date, timezone: string) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timezone;
}

/** PHP `Y-m-d H:i:s T` (session report). */
export function reportDateTime(date: Date | string | null | undefined, timezone: string) {
  if (!date) return "";
  const value = new Date(date);
  return `${formatInZone(value, "yyyy-MM-dd HH:mm:ss", timezone)} ${zoneAbbreviation(value, timezone)}`;
}

/** PHP `m.d.Y H:i:s` (usage report). */
export function usageDateTime(date: Date | string, timezone: string) {
  return formatInZone(date, "MM.dd.yyyy HH:mm:ss", timezone);
}

/** Collapses newlines like the legacy report did with the User-Agent. */
export function oneLine(text: string) {
  return text.replace(/[\r\n]+/g, " ").trim();
}

/** "2.4 MB", "830 KB". */
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "3h 20m", "45m", "under a minute" — total time for the Details tab. */
export function compactDuration(seconds: number) {
  if (seconds < 60) return seconds > 0 ? "under a minute" : "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Friendly browser/device name from a User-Agent, for the usage report UI. */
export function deviceSummary(userAgent: string) {
  const ua = userAgent || "";
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? /iPad/.test(ua)
      ? "iPad"
      : "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua) && !/Chromium/.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} on ${os}`;
}
