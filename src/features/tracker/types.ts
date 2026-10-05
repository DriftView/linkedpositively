/** Client-safe DTOs and shared types for the tracker feature. */

export type TrackerKind = "hormones" | "prep" | "sex" | "custom";

export type ReminderChannel = "sms" | "in_app";
export type ReminderFrequency = "daily" | "weekly";

export type ReminderSchedule = {
  enabled: boolean;
  channel: ReminderChannel;
  frequency: ReminderFrequency;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  hour: number;
  minute: 0 | 30;
  text?: string | null;
};

/** One day of the daily check-in calendar (the contract used by Peer Navigation too). */
export type CheckinCalendarDay = {
  /** Local day "yyyy-MM-dd". */
  date: string;
  meds: boolean | null;
  mood: number | null;
};

/** One day of a personal tracker's calendar. */
export type TrackerCalendarDay = { date: string; done: boolean };

export type TodayCheckin = {
  day: string;
  meds: boolean | null;
  mood: number | null;
};

export type TrackerSummary = {
  id: string;
  kind: TrackerKind;
  label: string;
  question: string;
  reminder: ReminderSchedule;
  createdAt: string;
  /** Today's answer, null when not answered yet. */
  today: boolean | null;
  /** The last 7 local days, oldest first. */
  week: { date: string; done: boolean | null }[];
};

/** Result returned by check-in actions so the UI can celebrate. */
export type PointsResult = { awarded: boolean; points?: number; total?: number };
