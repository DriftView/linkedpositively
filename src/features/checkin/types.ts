/** Client-safe DTOs for the weekly check-in. */

export type CheckinDay = {
  date: string; // yyyy-MM-dd
  weekday: string; // "Monday"
  label: string; // "Sep 21"
  /** true took meds · false missed · null no answer */
  medsTaken: boolean | null;
  mood: { value: number; label: string; src: string } | null;
  used: boolean | null;
};

export type CheckinPromptData = {
  sequence: number;
  title: string;
  likertText: string;
  options: { value: number; label: string }[];
  openText: string;
  openPlaceholder: string;
};

export type CheckinFeedback = {
  /** Sanitized staff HTML for the Likert band. */
  long: string;
  /** Medication feedback (plain text), or empty. */
  short: string;
};

export type CheckinAnswer = {
  likertValue: number | null;
  openAnswer: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
  feedback: CheckinFeedback | null;
};

export type CheckinHistoryItem = {
  week: number;
  start: string;
  end: string;
  status: "answered" | "missed" | "open";
  likertLabel: string | null;
  medsTaken: number;
  medsAnswered: number;
};
