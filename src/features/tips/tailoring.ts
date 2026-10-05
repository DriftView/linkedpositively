/**
 * Tailored ("recommended") tips (docs/legacy/02-checkin-and-tips.md §1.3).
 *
 * A tip may carry a rule `{ field, operator, value }` over the participant's
 * baseline-survey scores (i1…i9, m1…m9, b1…b17). The old site used PHP's
 * `version_compare` on these integers; here the comparison is numeric, and a
 * missing score never matches.
 */
export type TailoringRule = { field: string; operator: string; value: number };
export type TailoringScores = Record<string, number | string | null | undefined>;

export function compareScore(score: number, operator: string, value: number): boolean {
  switch (operator) {
    case "<":
      return score < value;
    case ">":
      return score > value;
    case "==":
      return score === value;
    case "<=":
      return score <= value;
    case ">=":
      return score >= value;
    case "!=":
      return score !== value;
    default:
      return false;
  }
}

export function isRecommended(rule: TailoringRule | null | undefined, scores: TailoringScores | null | undefined): boolean {
  if (!rule || !scores) return false;
  const raw = scores[rule.field];
  if (raw === null || raw === undefined || raw === "") return false;
  const score = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(score)) return false;
  return compareScore(score, rule.operator, rule.value);
}

const OPERATOR_WORDS: Record<string, string> = {
  "<": "below",
  ">": "above",
  "==": "exactly",
  "<=": "at most",
  ">=": "at least",
  "!=": "anything but",
};

/** "b3 at least 4" — for staff screens. */
export function describeRule(rule: TailoringRule) {
  return `${rule.field.toUpperCase()} ${OPERATOR_WORDS[rule.operator] ?? rule.operator} ${rule.value}`;
}
