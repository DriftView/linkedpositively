import { LEGACY_REDIRECTS as STAFF_REDIRECTS, type LegacyRedirect } from "../features/admin/legacy-redirects";
import { REPORTS } from "../features/reports/catalog";

/** Old report URLs → the report page, or its CSV for the old "-csv"/"-xls" exports. */
const REPORT_REDIRECTS: LegacyRedirect[] = REPORTS.flatMap((report) =>
  report.legacyPaths.map((source) => ({
    source,
    destination: /(-csv|-xls)$/.test(source) ? `/admin/reports/${report.slug}/csv` : `/admin/reports/${report.slug}`,
    permanent: true,
  })),
);

/**
 * Old Drupal URLs (both sites) → new pages, so bookmarks, emails and links in
 * SMS messages keep working. URLs that need a database lookup (node and user
 * ids) go through /legacy/[kind]/[id].
 * Specific rules come first: Next.js uses the first match.
 */
const PARTICIPANT_REDIRECTS: LegacyRedirect[] = [
  // Wall, notifications, search
  { source: "/drupal-wall", destination: "/", permanent: true },
  { source: "/wall-post/:nid(\\d+)", destination: "/posts/legacy/:nid", permanent: true },
  { source: "/post/:nid(\\d+)/edit", destination: "/posts/legacy/:nid?edit=1", permanent: true },
  { source: "/all-comments", destination: "/notifications", permanent: true },
  { source: "/all/mentions", destination: "/notifications", permanent: true },
  { source: "/search/uy-tags/:term", destination: "/search?tag=:term", permanent: true },
  { source: "/commentedit/:cid/:uid", destination: "/", permanent: true },

  // Tips and weekly check-in
  { source: "/thrive-tips", destination: "/tips", permanent: true },
  { source: "/thrive-tips/recommended", destination: "/tips/explore?for=you", permanent: true },
  { source: "/thrive-tips/favs", destination: "/tips/favorites", permanent: true },
  { source: "/thrive-tips/tags", destination: "/tips/explore", permanent: true },
  { source: "/thrive-tips/tags/:tags", destination: "/tips/explore?tags=:tags", permanent: true },
  { source: "/thrive-tips/thrive-content/:nid(\\d+)/:tid", destination: "/legacy/node/:nid", permanent: true },
  { source: "/comment-tip/:nid(\\d+)", destination: "/legacy/node/:nid", permanent: true },
  { source: "/weekly-checkin", destination: "/check-in", permanent: true },
  { source: "/weekly_checkin", destination: "/check-in", permanent: true },
  { source: "/weekly-feedback", destination: "/check-in/history", permanent: true },
  { source: "/weekly_feedback", destination: "/check-in/history", permanent: true },

  // Trackers
  { source: "/my-tracking", destination: "/tracker", permanent: true },
  { source: "/my-tracking/:uid", destination: "/tracker", permanent: true },
  { source: "/tracking", destination: "/tracker/personal", permanent: true },
  { source: "/reminders", destination: "/tracker/reminders", permanent: true },
  { source: "/reload-calendar", destination: "/tracker", permanent: true },
  { source: "/calendar", destination: "/tracker", permanent: true },

  // Profiles and account
  { source: "/my-profile", destination: "/profile", permanent: true },
  { source: "/this_week", destination: "/leaderboard", permanent: true },
  { source: "/user/edit-my-profile", destination: "/settings", permanent: true },
  { source: "/myaccount", destination: "/settings", permanent: true },
  { source: "/edit-profile-form-page", destination: "/settings", permanent: true },
  { source: "/user/:uid(\\d+)/edit", destination: "/settings", permanent: true },
  { source: "/user/view-profile/:uid(\\d+)", destination: "/legacy/user/:uid", permanent: true },
  { source: "/user/:uid(\\d+)", destination: "/legacy/user/:uid", permanent: true },

  // Resources, pages, glossary, support
  { source: "/locations", destination: "/resources", permanent: true },
  { source: "/location/:nid(\\d+)", destination: "/api/resources/legacy/:nid", permanent: true },
  { source: "/add-resource", destination: "/resources/suggest", permanent: true },
  { source: "/yt-glossary", destination: "/glossary", permanent: true },
  { source: "/yt-glossary/:letter", destination: "/glossary", permanent: true },
  { source: "/node/add/tech-support", destination: "/support", permanent: true },
  { source: "/admin/suggested-resources", destination: "/admin/content/resources?tab=suggested", permanent: true },
  { source: "/admin/flagged-resources", destination: "/admin/content/resources?tab=reported", permanent: true },
  { source: "/import/resources_import", destination: "/admin/content/resources/import", permanent: true },
  { source: "/admin/abuse-node", destination: "/admin/moderation?view=posts", permanent: true },
  { source: "/admin/abuse-comment", destination: "/admin/moderation?view=comments", permanent: true },
  { source: "/about", destination: "/pages/about", permanent: true },
  { source: "/about-us", destination: "/pages/about-us", permanent: true },
  { source: "/about/support", destination: "/pages/support", permanent: true },
  { source: "/faq", destination: "/pages/faq", permanent: true },
  { source: "/help", destination: "/pages/help", permanent: true },
  { source: "/community-guidelines", destination: "/pages/community-guidelines", permanent: true },
  { source: "/terms-disclosure", destination: "/pages/terms-disclosure", permanent: true },
  { source: "/feedback-contact", destination: "/pages/feedback-contact", permanent: true },
  { source: "/getting-started-with-twm", destination: "/pages/getting-started", permanent: true },
  { source: "/node/498", destination: "/pages/terms-disclosure", permanent: true },
  { source: "/node/:nid(\\d+)", destination: "/legacy/node/:nid", permanent: true },

  // Peer Navigation
  { source: "/dashboard", destination: "/coach", permanent: true },
  { source: "/user-dashboard", destination: "/coaching", permanent: true },
  { source: "/user-files", destination: "/coaching/files", permanent: true },
  { source: "/user-messages", destination: "/coaching/messages", permanent: true },
  { source: "/coach-details", destination: "/coaching/coach", permanent: true },
  { source: "/create-relationship", destination: "/coach/relationships", permanent: true },
  { source: "/load-session/:session", destination: "/coach", permanent: true },
  { source: "/admin/session-report", destination: "/admin/reports/sessions", permanent: true },
  { source: "/admin/session-report/csv", destination: "/admin/reports/sessions/csv", permanent: true },
  { source: "/admin/reports/ecoach-standard-usage-report", destination: "/admin/reports/peernav-usage", permanent: true },
  { source: "/admin/reports/ecoach-standard-usage-report/csv", destination: "/admin/reports/peernav-usage/csv", permanent: true },
  { source: "/techstep", destination: "/", permanent: true },
  { source: "/ecoach", destination: "/coaching", permanent: true },

  // Sign out
  { source: "/user/logout", destination: "/logout", permanent: false },
  { source: "/survey_reports", destination: "/admin/reports/surveys", permanent: true },
];

const seen = new Set<string>();
/** All legacy redirects, participant rules first; later duplicates are dropped. */
export const ALL_LEGACY_REDIRECTS = [...PARTICIPANT_REDIRECTS, ...REPORT_REDIRECTS, ...STAFF_REDIRECTS].filter((rule) => {
  if (seen.has(rule.source)) return false;
  seen.add(rule.source);
  return true;
});
