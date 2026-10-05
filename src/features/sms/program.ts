/**
 * The weekly SMS program (legacy `youthrive_sms_reminders`), as data.
 *
 * Texts are the study's own copy, verbatim from the old module, used as the
 * default templates (staff can edit them at /admin/content/sms). `<link>` is
 * replaced by the participant's signed short link at send time.
 *
 * Changes from the old site:
 * - WELCOME had the site URL glued to the text with no space; the template now
 *   ends with " <link>" so the link is separated and tracked like the others.
 * - Link targets point at the new app's pages (/my-profile → /profile,
 *   /locations → /resources, /tracking → /tracker).
 */

export const PROGRAM_WEEKS = 24;
export const WELCOME_KEY = "WELCOME";
export const LINK_TOKEN = "<link>";
/** Minutes between randomization and the WELCOME text (legacy: +15 min). */
export const WELCOME_DELAY_MINUTES = 15;

export function weekKey(week: number) {
  return week === 0 ? WELCOME_KEY : `WEEK-${week}`;
}

export function weekFromKey(key: string) {
  if (key === WELCOME_KEY) return 0;
  const match = /^WEEK-(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

/** Pages a program text can link to. */
export const LINK_TARGETS = [
  { path: "/", label: "Home (the Wall)" },
  { path: "/profile", label: "Profile" },
  { path: "/tips", label: "Tips" },
  { path: "/tracker", label: "Tracker" },
  { path: "/resources", label: "Resource locator" },
  { path: "/check-in", label: "Weekly check-in" },
  { path: "/levels", label: "Levels & points" },
  { path: "/surveys", label: "Surveys" },
] as const;

export type DefaultTemplate = { key: string; week: number; body: string; linkPath: string; mediaPath: string };

const PROFILE = "/profile";
const RESOURCES = "/resources";
const TRACKER = "/tracker";
const TIPS = "/tips";
const HOME = "/";

/** Legacy link routing (SR:116-141): 1,19 → profile; 3,12,16 → locations; 6,11,20 → tracking; 7,10,14 → tips; else root. */
export function legacyLinkPath(week: number) {
  if (week === 1 || week === 19) return PROFILE;
  if ([3, 12, 16].includes(week)) return RESOURCES;
  if ([6, 11, 20].includes(week)) return TRACKER;
  if ([7, 10, 14].includes(week)) return TIPS;
  return HOME;
}

function mediaFor(week: number) {
  if (week === 0) return "/sms/welcome.gif";
  return `/sms/image${week}.${[1, 2, 6].includes(week) ? "jpg" : "gif"}`;
}

const TEXTS: Record<number, string> = {
  0: "Hey! Your account is set up and ready to go, and you can expect to be receiving reminder texts from me for the next 6 months. <link>",
  1: "Hey, just your weekly LinkPositively reminder here! Want to tell us more about yourself? Click here to fill out your profile <link>",
  2: "Hey! Read more, know more! Log in to the LinkPositively site here to read today’s Tips! <link>",
  3: "Hi! Have you tried the resource locator feature yet? Use it to find resources near you! <link>",
  4: "Hey! See how close you are to unlocking a new feature! Log in to the LinkPositively site to see. <link>",
  5: "Hey! Post on the LinkPositively wall and tell us: Whats the 411? <link>",
  6: "If you’re having a hard time keeping track of things, use LinkPositively to make life a little less stressful by tracking it here <link>",
  7: "Hello from LinkPositively! Knowledge is Power! Log in to the site and check out today’s tips. <link>",
  8: "Hey folks! LinkPositively here. Log in to the LinkPositively site to see your points <link>",
  9: "Hey there! It’s LinkPositively. Check out what’s trending now on the site <link>",
  10: "Hey, it’s LinkPositively. Wanna learn something new today? Read today’s tip here by logging in to the LinkPositively site <link>",
  11: "Hey, it’s LinkPositively. How are you feeling today? Let us know on the “Tracker” feature of the site <link>",
  12: "Hey! Have you used the resource locator yet? Review the services you’ve received here  <link>",
  13: "Hi there, it’s LinkPositively! Have you logged onto the site today? Check it out!  <link>",
  14: "Hey, it’s LinkPositively! Have you read today’s tip yet? Login here to see! <link>",
  15: "Hey, it’s LinkPositively. Log in here to track your things and more! <link>",
  16: "Hey, it’s LinkPositively. You’re not alone! Use the resource locator to find support groups, events and more <link>",
  17: "Hi, log in to LinkPositively and earn more points today! <link>",
  18: "Hi. Want to know the latest? Login to the LinkPositively site to find out more <link>",
  19: "Hi, it’s LinkPositively! Have you cashed in your points yet? Login to the site to see if you’re ready to unlock new avatars, theme colors, and more! <link>",
  20: "It’s Von from LinkPositively again! Use the LinkPositively tracker to remember one less thing. <link>",
  21: "Hey, it’s LinkPositively Let everyone know how you’re doing by posting on the wall! <link>",
  22: "Hello, LinkPositively here. Just a reminder that there are only a couple weeks left on the LinkPositively site.<link>",
  23: "LinkPositively here! If you have any questions for your community, ask them now because we’re almost done!",
  24: "Hey y’all, it’s LinkPositively! You only have a few days left on the LinkPositively Site. Make sure you start saying your good byes!",
};

export const DEFAULT_TEMPLATES: DefaultTemplate[] = Array.from({ length: PROGRAM_WEEKS + 1 }, (_, week) => ({
  key: weekKey(week),
  week,
  body: TEXTS[week],
  linkPath: TEXTS[week].includes(LINK_TOKEN) ? legacyLinkPath(week) : "",
  mediaPath: mediaFor(week),
}));

/** MMS images shipped in public/sms (site-authored program art). */
export const MEDIA_OPTIONS = DEFAULT_TEMPLATES.map((template) => template.mediaPath);

/** Builds the final text: `<link>` → url (or removed when there is no link). */
export function renderSmsBody(body: string, url: string | null) {
  if (!body.includes(LINK_TOKEN)) return body;
  return url ? body.replace(LINK_TOKEN, url) : body.replace(LINK_TOKEN, "").trim();
}
