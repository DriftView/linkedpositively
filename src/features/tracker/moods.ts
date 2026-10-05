/**
 * The 12 moods of the daily check-in, in the order and numbering the old site
 * stored (`reminder_checkin.moods`, docs/legacy/05 §9). Faces are the legacy
 * "Emoticon" SVGs in public/moods (grey ring and drop shadow removed).
 */
export type Mood = {
  value: number;
  label: string;
  src: string;
  /** Rough valence, used for quiet colour hints and summaries. */
  tone: "bright" | "steady" | "low";
};

export const MOODS: readonly Mood[] = [
  { value: 1, label: "Happy", src: "/moods/happy.svg", tone: "bright" },
  { value: 2, label: "Excited", src: "/moods/excited.svg", tone: "bright" },
  { value: 3, label: "Silly", src: "/moods/silly.svg", tone: "bright" },
  { value: 4, label: "Confident", src: "/moods/confident.svg", tone: "bright" },
  { value: 5, label: "Calm", src: "/moods/calm.svg", tone: "steady" },
  { value: 6, label: "Bored", src: "/moods/bored.svg", tone: "steady" },
  { value: 7, label: "Confused", src: "/moods/confused.svg", tone: "steady" },
  { value: 8, label: "Worried", src: "/moods/worried.svg", tone: "low" },
  { value: 9, label: "Overwhelmed", src: "/moods/overwhelmed.svg", tone: "low" },
  { value: 10, label: "Sad", src: "/moods/sad.svg", tone: "low" },
  { value: 11, label: "Frustrated", src: "/moods/frustrated.svg", tone: "low" },
  { value: 12, label: "Angry", src: "/moods/angry.svg", tone: "low" },
];

export function moodFor(value: number | null | undefined): Mood | null {
  if (!value) return null;
  return MOODS[value - 1] ?? null;
}
