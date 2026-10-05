import { Inngest } from "inngest";

/**
 * Background jobs run through Inngest. Locally, `pnpm jobs` starts the Inngest
 * dev server, which calls /api/inngest. Event payloads carry ids only: never
 * names, phone numbers or check-in answers.
 */
export const inngest = new Inngest({
  id: "link-positively",
  isDev: process.env.NODE_ENV !== "production",
});
