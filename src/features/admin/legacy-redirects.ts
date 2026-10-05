/**
 * Old Drupal URLs of the staff tools, account pages and surveys, redirected
 * to their new homes. Spread into `redirects()` in next.config.ts.
 * (Participant pages — wall, tips, tracker, resources — are redirected by
 * their own areas.)
 */

export type LegacyRedirect = { source: string; destination: string; permanent: boolean };

export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  // Staff tools (shortcut set, main-menu and VBO views)
  { source: "/admin/add-participant", destination: "/admin/users/new", permanent: true },
  { source: "/admin/people/create", destination: "/admin/users/new", permanent: true },
  { source: "/admin/people", destination: "/admin/users", permanent: true },
  { source: "/admin/manage-participants", destination: "/admin/users?view=participants", permanent: true },
  { source: "/admin/user-operations", destination: "/admin/randomization", permanent: true },
  { source: "/user-operations", destination: "/admin/randomization", permanent: true },
  { source: "/admin/uy-reports", destination: "/admin/reports", permanent: true },
  { source: "/admin/access-report", destination: "/admin/reports", permanent: true },
  { source: "/access_report", destination: "/admin/reports", permanent: true },
  { source: "/admin/tutorials", destination: "/admin/content/pages", permanent: true },
  { source: "/admin/tech-support", destination: "/admin/support", permanent: true },
  { source: "/admin/abuse-node", destination: "/admin/moderation", permanent: true },
  { source: "/admin/abuse-comment", destination: "/admin/moderation", permanent: true },
  { source: "/admin/suggested-resources", destination: "/admin/content/resources", permanent: true },
  { source: "/admin/flagged-resources", destination: "/admin/content/resources", permanent: true },
  { source: "/admin/resources-list", destination: "/admin/content/resources", permanent: true },
  { source: "/admin/tips-list", destination: "/admin/content/tips", permanent: true },
  { source: "/admin/config/system/twilio", destination: "/admin/content/sms", permanent: true },
  { source: "/admin/config/system/twilio/:path*", destination: "/admin/content/sms", permanent: true },
  { source: "/admin/reports/shorten", destination: "/admin/content/sms/log", permanent: true },
  { source: "/admin/config/services/shorten/:path*", destination: "/admin/content/sms", permanent: true },
  { source: "/admin/config", destination: "/admin/settings", permanent: true },
  { source: "/admin/dashboard", destination: "/admin", permanent: true },
  { source: "/masquerade/switch/:uid", destination: "/admin/users", permanent: false },
  { source: "/masquerade/unswitch", destination: "/admin", permanent: false },

  // Surveys (Qualtrics configuration and the dead "Survey Report" link)
  { source: "/survey", destination: "/admin/surveys", permanent: true },
  { source: "/admin/survey", destination: "/admin/surveys", permanent: true },
  { source: "/admin/survey_mapping", destination: "/admin/surveys", permanent: true },
  { source: "/admin/survey_details", destination: "/admin/surveys", permanent: true },
  { source: "/admin/survey_logs", destination: "/admin/surveys", permanent: true },
  { source: "/admin/config/system/qualtrics-url", destination: "/admin/surveys", permanent: true },
  { source: "/survey_reports", destination: "/admin/surveys", permanent: true },

  // Account pages (core user module + LoginToboggan)
  { source: "/user/login", destination: "/login", permanent: true },
  { source: "/user/register", destination: "/login", permanent: true },
  { source: "/user/password", destination: "/forgot-password", permanent: true },
  { source: "/user/reset/:path*", destination: "/forgot-password", permanent: true },
  { source: "/user/logout", destination: "/login", permanent: false },
  { source: "/user/edit-my-profile", destination: "/profile", permanent: true },
];

/**
 * Participant pages the old program texts linked to (`/my-profile?sms=…`),
 * used by /r/legacy to land on the right new page.
 */
const SMS_LANDING: Record<string, string> = {
  "/my-profile": "/profile",
  "/locations": "/resources",
  "/tracking": "/tracker",
  "/my-tracking": "/tracker",
  "/tips": "/tips",
  "/drupal-wall": "/",
};

export function legacyPathFor(path: string) {
  const [pathname, query] = path.split("?");
  const mapped = SMS_LANDING[pathname.replace(/\/+$/, "") || "/"] ?? pathname;
  return query ? `${mapped}?${query}` : mapped;
}
