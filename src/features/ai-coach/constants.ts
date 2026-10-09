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
  {
    id: "988",
    label: "Call or text 988",
    detail: "Suicide & Crisis Lifeline. Free, confidential, 24/7.",
    href: "tel:988",
  },
  { id: "ctl", label: "Text HOME to 741741", detail: "Crisis Text Line, 24/7.", href: "sms:741741?&body=HOME" },
  {
    id: "trevor",
    label: "The Trevor Project: 1-866-488-7386",
    detail: "For LGBTQ+ young people, 24/7.",
    href: "tel:18664887386",
  },
  {
    id: "dv",
    label: "Domestic violence hotline: 1-800-799-7233",
    detail: "Or text START to 88788.",
    href: "tel:18007997233",
  },
];

/** Hands-free talk: silence that ends the member's turn, and how long an unused open mic stays on. */
export const END_OF_TURN_SILENCE_MS = 900;
export const HANDS_FREE_IDLE_MS = 90_000;

/** Most text spoken for one reply (keeps a long answer from running up the voice bill). */
export const MAX_SPOKEN_CHARS = 2500;

/** Starter questions on an empty conversation. */
export const STARTER_PROMPTS = [
  "Where can I get an HIV test near me?",
  "What's the difference between PrEP and PEP?",
  "I'm feeling stressed. Can we talk?",
  "Can I talk to a peer navigator?",
];
