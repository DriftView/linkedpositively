import type { AiAlertCategory } from "@/server/db/schema/ai";

/**
 * First line of the AI Coach safety layer: a fast keyword check that runs on
 * every member message before Claude answers, and keeps working when the AI
 * service is down. It is deliberately conservative (a false alarm shows crisis
 * lines and asks staff to look; a miss could be worse). The Claude safety
 * classifier (classifier.ts) runs alongside it and catches what keywords miss.
 * Pure: no server imports, unit-tested in safety.test.ts.
 */

export type KeywordRisk = { level: "elevated" | "urgent"; category: AiAlertCategory };

type Rule = KeywordRisk & { pattern: RegExp };

// Apostrophes are normalised to ' before matching, and text is lower-cased.
const RULES: Rule[] = [
  {
    level: "urgent",
    category: "suicide",
    pattern:
      /\b(kill(ing)? my ?self|end(ing)? (it all|my life|things)|suicid(e|al)|want(ed)? to die|wanna die|wish i (was|were) dead|don'?t want to (be alive|live|wake up|be here anymore)|better off (dead|without me)|take my (own )?life|no reason to (live|go on)|hang(ing)? myself|unalive)\b/,
  },
  {
    level: "urgent",
    category: "overdose",
    pattern:
      /\b(overdos(e|ed|ing)|od'?d|took (too many|a bunch of|all (my|the)) (pills|meds)|can'?t wake (him|her|them) up)\b/,
  },
  {
    level: "urgent",
    category: "violence",
    pattern:
      /\b(going to|gonna|want to|wanna) (kill|hurt|shoot|stab) (him|her|them|someone|somebody|people)\b|\bbring a (gun|knife) to\b/,
  },
  {
    level: "urgent",
    category: "medical",
    pattern:
      /\b(can'?t breathe|chest pain|having a seizure|passed out|bleeding (a lot|heavily|won'?t stop)|throat (is )?closing)\b/,
  },
  {
    level: "elevated",
    category: "self_harm",
    pattern: /\b(cut(ting)? myself|hurt(ing)? myself|self[- ]?harm(ing)?|burn(ing|ed)? myself|starv(e|ing) myself)\b/,
  },
  {
    level: "elevated",
    category: "abuse",
    pattern:
      /\b(he|she|they|my (partner|boyfriend|girlfriend|husband|wife|dad|mom|father|mother|parent|roommate)) (hits?|beats?|chokes?|hurts?|threatens?) me\b(?! up)|\b(i was|i got|been|being) (raped|sexually assaulted|abused|trafficked)\b|\bnot safe (at home|where i live)\b|\b(forced|made) me (have sex|do sexual)\b/,
  },
];

export function normalizeForSafety(text: string) {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, " ");
}

/** The most serious keyword match in `text`, or null. Urgent beats elevated; rule order breaks ties. */
export function detectKeywordRisk(text: string): KeywordRisk | null {
  const normalized = normalizeForSafety(text);
  let found: KeywordRisk | null = null;
  for (const rule of RULES) {
    if (!rule.pattern.test(normalized)) continue;
    if (!found || (rule.level === "urgent" && found.level !== "urgent"))
      found = { level: rule.level, category: rule.category };
    if (found.level === "urgent") break;
  }
  return found;
}

const LEVEL_ORDER = { none: 0, support: 1, elevated: 2, urgent: 3 } as const;
export type RiskLevel = keyof typeof LEVEL_ORDER;

export function riskRank(level: RiskLevel) {
  return LEVEL_ORDER[level];
}

/** The more serious of two risk levels. */
export function maxRisk<T extends RiskLevel>(a: T, b: T): T {
  return riskRank(a) >= riskRank(b) ? a : b;
}
