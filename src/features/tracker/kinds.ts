import type { TrackerKind } from "./types";

/**
 * Preset tracker types (legacy taxonomy `custom_tracking`: 296 Hormones,
 * 297 PrEP, 298 Sex) plus "custom", where the participant names it.
 */
export const TRACKER_PRESETS: { kind: Exclude<TrackerKind, "custom">; label: string; termId: number; question: string }[] = [
  { kind: "prep", label: "PrEP", termId: 297, question: "Did you take your PrEP today?" },
  { kind: "hormones", label: "Hormones", termId: 296, question: "Did you take your hormones today?" },
  { kind: "sex", label: "Sex", termId: 298, question: "Did you have sex today?" },
];

export function trackerQuestion(kind: TrackerKind, label: string) {
  const preset = TRACKER_PRESETS.find((item) => item.kind === kind);
  if (preset) return preset.question;
  return `Did you do “${label}” today?`;
}

/** Default reminder wording, used when the participant leaves it blank. */
export function defaultReminderText(kind: TrackerKind, label: string) {
  return trackerQuestion(kind, label);
}

export const MAX_ACTIVE_TRACKERS = 10;
