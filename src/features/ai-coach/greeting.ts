/**
 * The floating coach's greeting when a member opens the app: a short, warm
 * line from a fixed, reviewed list (never written by the model, so it can't
 * bypass the safety layers), fitted to the time of day. The member's first
 * name goes in the text only, so the audio is the same for everyone with that
 * coach and can be made once. Pure: unit-tested in greeting.test.ts.
 */

/** Said after "Good morning. I'm Mina, your AI coach." Neutral on purpose: no assumptions about how anyone feels. */
export const GREETINGS = [
  "Small steps still count. I'm here whenever you want to talk.",
  "Whatever today looks like, you don't have to figure it out alone. Tap me any time.",
  "Got a question, or just want to think out loud? I'm listening.",
  "Taking care of yourself starts with checking in. I'm here when you're ready.",
  "Ask me anything about your health, or just say hi. I'm right here.",
] as const;

export type Greeting = { index: number; spoken: string; text: string };

function salutation(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 23) return "Good evening";
  return "Hi there";
}

/** The greeting for this visit. `seed` picks the line (e.g. the day of the year), so it changes from day to day. */
export function greetingFor({
  coachName,
  firstName,
  hour,
  seed,
}: {
  coachName: string;
  firstName?: string | null;
  hour: number;
  seed: number;
}): Greeting {
  const index = Math.abs(Math.trunc(seed)) % GREETINGS.length;
  const hello = salutation(hour);
  const rest = `I'm ${coachName}, your AI coach. ${GREETINGS[index]}`;
  return {
    index,
    spoken: `${hello}. ${rest}`,
    text: firstName ? `${hello}, ${firstName}. ${rest}` : `${hello}. ${rest}`,
  };
}

/** Whether to greet now: at most once a session and once a day, never when switched off or while staff view as the member. */
export function shouldGreet(state: {
  enabled: boolean;
  impersonating: boolean;
  greetedThisSession: boolean;
  lastGreetedDay: string | null;
  today: string;
}) {
  return state.enabled && !state.impersonating && !state.greetedThisSession && state.lastGreetedDay !== state.today;
}
