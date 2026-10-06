import type { AiCoachLook } from "@/server/db/schema/ai";

/**
 * AI Coach constants shared by the server and the browser. No server imports.
 * Product decisions behind these numbers: docs/AI_COACH.md.
 */

/** Longest message a member can send. */
export const MAX_MESSAGE_LENGTH = 2000;

/** Messages a member can send per hour before the coach asks them to take a break. */
export const HOURLY_MESSAGE_LIMIT = 40;

/**
 * Member turns per conversation. Conversations are replayed whole (never
 * trimmed), so very long ones are closed and the member starts a new one.
 */
export const MAX_TURNS_PER_CONVERSATION = 60;

/** Longest voice recording accepted for transcription. */
export const MAX_RECORDING_SECONDS = 90;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export type CrisisLine = { id: string; label: string; detail: string; href: string };

/** Shown whenever a possible crisis is detected, and on the coach's safety sheet. */
export const CRISIS_LINES: CrisisLine[] = [
  { id: "911", label: "Call 911", detail: "If you or someone else is in immediate danger.", href: "tel:911" },
  { id: "988", label: "Call or text 988", detail: "Suicide & Crisis Lifeline. Free, confidential, 24/7.", href: "tel:988" },
  { id: "ctl", label: "Text HOME to 741741", detail: "Crisis Text Line, 24/7.", href: "sms:741741?&body=HOME" },
  { id: "trevor", label: "The Trevor Project: 1-866-488-7386", detail: "For LGBTQ+ young people, 24/7.", href: "tel:18664887386" },
  { id: "dv", label: "Domestic violence hotline: 1-800-799-7233", detail: "Or text START to 88788.", href: "tel:18007997233" },
];

export const COACH_LOOKS: { id: AiCoachLook; name: string; skin: string; skinShade: string; hair: string; shirt: string }[] = [
  { id: "amara", name: "Amara", skin: "#8d5524", skinShade: "#6f4119", hair: "#1f1410", shirt: "var(--brand-magenta)" },
  { id: "jordan", name: "Jordan", skin: "#c68642", skinShade: "#a86d33", hair: "#2b1a12", shirt: "var(--brand-sky)" },
  { id: "luis", name: "Luis", skin: "#e0ac69", skinShade: "#c48f50", hair: "#3b2416", shirt: "var(--brand-apricot)" },
  { id: "kai", name: "Kai", skin: "#f1c27d", skinShade: "#d9a862", hair: "#5a3825", shirt: "var(--brand-plum)" },
];

export function coachLook(id: string | null | undefined) {
  return COACH_LOOKS.find((look) => look.id === id) ?? COACH_LOOKS[0];
}

/** Starter questions on an empty conversation. */
export const STARTER_PROMPTS = [
  "Where can I get an HIV test near me?",
  "What's the difference between PrEP and PEP?",
  "I'm feeling stressed. Can we talk?",
  "Can I talk to a peer navigator?",
];
