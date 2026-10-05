import type { SupportStatus, SupportTopic } from "@/server/db/schema";

export const TOPIC_LABELS: Record<SupportTopic, string> = {
  login: "Signing in",
  app: "Using the app",
  notifications: "Notifications",
  sms: "Text messages",
  other: "Something else",
};

export const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Received",
  in_progress: "Working on it",
  resolved: "Resolved",
};

export const STAFF_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};

/** A short, non-identifying device summary: "Chrome on Android · 390×844". */
export function describeDevice(userAgent: string, width: number, height: number) {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unknown system";
  return `${browser} on ${os} · ${width}×${height}`;
}
