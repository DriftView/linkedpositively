import { dayKey, DEFAULT_TIMEZONE, studyDay } from "@/lib/dates";
import { studyDayStart } from "@/features/tips/schedule";

/**
 * Weekly check-in timing (docs/legacy/02-checkin-and-tips.md §2.3).
 *
 * Study weeks start on the intervention start date (in the participant's
 * timezone). The check-in for week k looks back at study days 7(k−1)+1…7k.
 * It opens when week k ends and stays open for the following 7 days; after
 * that it is closed (the daily job stores a "missed" snapshot).
 */
export const PROMPT_ROTATION = 10;

export type CheckinWeek = {
  week: number;
  /** yyyy-MM-dd of each of the 7 days, in order. */
  dates: string[];
  start: string;
  end: string;
  opensAt: Date;
  closesAt: Date;
};

export function checkinWeek(start: Date, week: number, timezone = DEFAULT_TIMEZONE): CheckinWeek {
  const clock = { start, timezone };
  const firstDay = 7 * (week - 1) + 1;
  const dates = Array.from({ length: 7 }, (_, i) => dayKey(studyDayStart(clock, firstDay + i), timezone));
  return {
    week,
    dates,
    start: dates[0],
    end: dates[6],
    opensAt: studyDayStart(clock, firstDay + 7),
    closesAt: studyDayStart(clock, firstDay + 14),
  };
}

/**
 * Which week's check-in is open right now (null during the first week or
 * before the study starts), and when the next one opens.
 */
export function checkinTiming(start: Date | null | undefined, now: Date, timezone = DEFAULT_TIMEZONE) {
  if (!start) return { started: false as const, openWeek: null, nextOpensAt: null, studyWeek: 0 };
  const day = studyDay(start, now, timezone);
  if (day < 1) {
    return { started: false as const, openWeek: null, nextOpensAt: studyDayStart({ start, timezone }, 8), studyWeek: 0 };
  }
  const week = Math.floor((day - 1) / 7) + 1;
  const openWeek = week >= 2 ? week - 1 : null;
  return {
    started: true as const,
    studyWeek: week,
    openWeek,
    nextOpensAt: studyDayStart({ start, timezone }, week * 7 + 1),
  };
}

/** Prompt slot (1…10) used for a week; the rotation repeats after 10 weeks. */
export function promptSequence(week: number) {
  return ((week - 1) % PROMPT_ROTATION) + 1;
}

export type FeedbackBand = "low" | "medium" | "high";

/** Likert 1–2 → low, 3 → medium, 4–5 → high (legacy WC:445-483). */
export function feedbackBand(likert: number): FeedbackBand {
  if (likert <= 2) return "low";
  if (likert === 3) return "medium";
  return "high";
}

/**
 * Medication feedback: none for the first prompt; "more adherent" when every
 * one of the 7 days was a yes, otherwise "less adherent" (legacy WC:381-403).
 */
export function adherenceBand(sequence: number, meds: (boolean | null)[]): "more" | "less" | null {
  if (sequence === 1) return null;
  return meds.length === 7 && meds.every((m) => m === true) ? "more" : "less";
}
