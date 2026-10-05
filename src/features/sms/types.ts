export type TemplateRow = {
  key: string;
  week: number;
  body: string;
  linkPath: string;
  mediaPath: string;
  active: boolean;
  sent: number;
  clicked: number;
  failed: number;
  scheduled: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SendStatus = "scheduled" | "sending" | "sent" | "failed" | "skipped" | "cancelled";

export type SendLogRow = {
  id: string;
  userId: string;
  name: string;
  studyId: string | null;
  flag: string;
  week: number;
  status: SendStatus;
  reason: string | null;
  scheduledFor: string;
  sentAt: string | null;
  clickedAt: string | null;
  clicks: number;
  body: string | null;
  timezone: string;
};

export type InboundRow = {
  id: string;
  userId: string | null;
  name: string | null;
  studyId: string | null;
  from: string;
  body: string;
  kind: "stop" | "start" | "help" | "message";
  receivedAt: string;
  read: boolean;
};

/** Plain-language labels for machine-readable skip/cancel reasons. */
export const REASON_LABELS: Record<string, string> = {
  missed_window: "Missed its send window",
  welcome_off: "Welcome texts are switched off",
  no_phone: "No phone number",
  opted_out: "Opted out of texts",
  template_off: "Message switched off",
  blocked: "Account deactivated",
  not_participant: "No longer a participant",
  restarted: "Schedule restarted",
  left_intervention: "Moved back to control",
  no_account: "Account deleted",
  staff: "Cancelled by staff",
  interrupted: "Interrupted while sending",
  error: "Unexpected error",
};

export function reasonLabel(reason: string | null) {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}
