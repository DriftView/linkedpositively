/**
 * Session checklist answers: validation and progress. Client-safe.
 *
 * Answers use the legacy form keys (see curriculum.ts): checkbox items are
 * booleans, text boxes and times are strings, radios are "1" (Yes) / "2" (No).
 */
import { NO, SESSION_FOOTER, SESSION_START_KEY, type CurriculumSession } from "./curriculum";

export type Answers = Record<string, boolean | string>;

export const MAX_ANSWER_LENGTH = 10000;
const RADIO_KEYS: string[] = [SESSION_FOOTER.onSchedule.key, SESSION_FOOTER.onPhone.key, SESSION_FOOTER.onVideo.key];

export function checkboxKeys(session: CurriculumSession) {
  return session.sections.flatMap((section) => section.items.map((item) => item.key));
}

export function textKeys(session: CurriculumSession) {
  return [
    SESSION_START_KEY,
    ...session.sections.flatMap((section) => section.items.flatMap((item) => item.texts.map((t) => t.key))),
    SESSION_FOOTER.endTime.key,
    SESSION_FOOTER.rescheduleReason.key,
  ];
}

/**
 * Keeps only the keys this session's form has, coerces types and trims
 * lengths. The reschedule reason is dropped unless the session was
 * rescheduled ("No"), which the old form never enforced.
 */
export function normalizeAnswers(session: CurriculumSession, input: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const key of checkboxKeys(session)) {
    const value = input[key];
    if (value === true || value === "1" || value === 1) out[key] = true;
  }
  for (const key of textKeys(session)) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) out[key] = value.slice(0, MAX_ANSWER_LENGTH);
  }
  for (const key of RADIO_KEYS) {
    const value = String(input[key] ?? "");
    if (value === "1" || value === "2") out[key] = value;
  }
  if (out[SESSION_FOOTER.onSchedule.key] !== NO) delete out[SESSION_FOOTER.rescheduleReason.key];
  return out;
}

export function sectionProgress(session: CurriculumSession, answers: Answers) {
  return session.sections.map((section) => ({
    title: section.title,
    done: section.items.filter((item) => answers[item.key] === true).length,
    total: section.items.length,
  }));
}

export function checklistProgress(session: CurriculumSession, answers: Answers) {
  const sections = sectionProgress(session, answers);
  const done = sections.reduce((sum, s) => sum + s.done, 0);
  const total = sections.reduce((sum, s) => sum + s.total, 0);
  return { done, total, sections };
}

/** True when two answer sets are the same (ignoring empty values). */
export function sameAnswers(a: Answers, b: Answers) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key] === false || a[key] === "" ? undefined : a[key];
    const y = b[key] === false || b[key] === "" ? undefined : b[key];
    if (x !== y) return false;
  }
  return true;
}
