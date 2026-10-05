/**
 * Every Link Positively study report: what it is, where it lived in Drupal
 * and the file name its export keeps (research scripts depend on those).
 * Client-safe. Computation lives in features/reports/queries/*.
 */
import type { Arm } from "./filters";

export const REPORT_GROUPS = [
  { id: "usage", label: "Usage and activity" },
  { id: "community", label: "Community" },
  { id: "tips", label: "Thrive Tips" },
  { id: "tracking", label: "Trackers and check-ins" },
  { id: "resources", label: "Resources" },
  { id: "profile", label: "Profiles" },
  { id: "surveys", label: "Surveys" },
] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number]["id"];

export type ReportMeta = {
  slug: string;
  title: string;
  /** One line for the hub. */
  summary: string;
  group: ReportGroup;
  /** Name in the old "LinkPositively Reports" hub (admin/uy-reports), if any. */
  legacyName?: string;
  /** Old Drupal paths (XLS and CSV routes) that should redirect here. */
  legacyPaths: string[];
  /** Export file name, kept from the old site. */
  filename: string;
  /** Population the old report covered. */
  defaultArm: Arm;
  /** Study ID required to appear (true for every legacy research report). */
  requireSid: boolean;
  /** Supports the date filter (a few "current state" reports don't). */
  dated: boolean;
  /** Built fresh; the old site had no such report or it never worked. */
  badge?: "New" | "Revived";
};

export const REPORTS: ReportMeta[] = [
  {
    slug: "usage",
    title: "Standard usage",
    summary: "Every sign-in with device and session length.",
    group: "usage",
    legacyName: "Standard Usage Report",
    legacyPaths: ["/standard-usage-report", "/standard-usage-report-csv"],
    filename: "Standard_Usage_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "engagement",
    title: "Standard user engagement",
    summary: "One row per participant: posts, tips, SMS clicks, goals, active days, points.",
    group: "usage",
    legacyName: "Standard User Engagement Report",
    legacyPaths: ["/user-engagement-report", "/user-engagement-report-csv"],
    filename: "Standard_User_Engagement_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "access",
    title: "System access by week",
    summary: "Tracked activity and active days per person for a date range.",
    group: "usage",
    legacyName: "Access Report",
    legacyPaths: ["/admin/access-report", "/access_report"],
    filename: "System_Access_Report.csv",
    defaultArm: "everyone",
    requireSid: false,
    dated: true,
  },
  {
    slug: "study-management",
    title: "Study management",
    summary: "Account age, last sign-in and days since last activity.",
    group: "usage",
    legacyName: "Study Management Report",
    legacyPaths: ["/study-management-csv", "/study-management-xls"],
    filename: "engagement_report_for_study_management.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: false,
  },
  {
    slug: "interaction",
    title: "Standard user interaction",
    summary: "Wall threads: each post, its replies and reaction counts.",
    group: "community",
    legacyName: "Standard User Interaction Report",
    legacyPaths: ["/user-interaction-report", "/user-interaction-report-csv"],
    filename: "Standard_User_Interaction.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "reactions",
    title: "Reactions given",
    summary: "Wall-post reactions each participant gave, by kind.",
    group: "community",
    legacyName: "Standard User Reactions Count Report",
    legacyPaths: ["/user-reactions-count", "/user-reactions-count-csv", "/reaction-count"],
    filename: "Standard_User_Reactions_Count_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "content-warnings",
    title: "Content warning posts",
    summary: "Wall posts each participant marked with a content warning.",
    group: "community",
    legacyName: "Standard User Content Warning Report",
    legacyPaths: ["/content-warning", "/content-warning-csv"],
    filename: "Standard_User_Content_Warning_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "content-warning-clicks",
    title: "Content warning clicks",
    summary: "How often each participant opened a post behind a content warning.",
    group: "community",
    legacyName: "Standard User Content Warning Clicks",
    legacyPaths: ["/content-warning-clics", "/content-warning-clics-csv"],
    filename: "Standard_User_Content_Warning_Clics_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
    badge: "Revived",
  },
  {
    slug: "tip-comments",
    title: "Thrive Tip comments",
    summary: "Comments each participant left on Thrive Tips.",
    group: "tips",
    legacyName: "Standard User Thrivetip Comments Report",
    legacyPaths: ["/thrivetip-comments", "/thrivetip-comments-csv", "/all-thrive-comments"],
    filename: "Standard_User_Thrivetip_Comments_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "tip-views",
    title: "Tip views matrix",
    summary: "Participant × tip: how many times each tip was opened.",
    group: "tips",
    legacyName: "User Tips Report",
    legacyPaths: ["/user-tips-report", "/user-tips-report-csv"],
    filename: "User_Tips_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "tip-favorites",
    title: "Favourite tips matrix",
    summary: "Participant × tip: which tips each participant saved.",
    group: "tips",
    legacyName: "User Fav Tips Report",
    legacyPaths: ["/user-fav-tips-report", "/user-fav-tips-report-csv"],
    filename: "User_Fav_Tips_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "checkins",
    title: "Daily check-ins",
    summary: "Medication and mood answers for the first 150 study days.",
    group: "tracking",
    legacyName: "Standard User CheckIn Report",
    legacyPaths: ["/user-checkin-report", "/user-checkin-report-csv"],
    filename: "User_CheckIn_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: false,
    badge: "Revived",
  },
  {
    slug: "tracker-views",
    title: "Tracker page views",
    summary: "How often each participant opened their trackers.",
    group: "tracking",
    legacyName: "Standard User tracker page views Report",
    legacyPaths: ["/tracker-page-view", "/tracker-page-view-csv"],
    filename: "Standard_User_Tracker_Page_View_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "tracked-items",
    title: "Tracked items",
    summary: "Personal trackers with start, last check-in and number of check-ins.",
    group: "tracking",
    legacyName: "Standard User Tracked Items Report",
    legacyPaths: ["/user-tracked-items", "/user-tracked-items-csv"],
    filename: "Standard_User_Tracked_Items_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "resource-views",
    title: "Resource views",
    summary: "How often each participant opened a resource.",
    group: "resources",
    legacyName: "Standard User Resource Views Report",
    legacyPaths: ["/resource-views-count", "/resource-views-count-csv"],
    filename: "Standard_User_Resource_Views_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "resource-comments",
    title: "Resource comments",
    summary: "Comments each participant left on resources.",
    group: "resources",
    legacyName: "Standard User Resource Comments Report",
    legacyPaths: ["/resources-comments", "/resources-comments-csv", "/all-resource-comments"],
    filename: "Standard_User_Resources_Comments_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "resource-ratings",
    title: "Resource ratings",
    summary: "Resources each participant rated.",
    group: "resources",
    legacyName: "Standard User Resource Rating Report",
    legacyPaths: ["/resources-rating", "/resources-rating-csv", "/resource-rating"],
    filename: "Standard_User_Resource_Ratings_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "submitted-resources",
    title: "Submitted resources",
    summary: "Resources participants suggested, with their review status.",
    group: "resources",
    legacyName: "Standard User Submitted Resources Report",
    legacyPaths: ["/user-submitted-resources", "/user-submitted-resources-csv"],
    filename: "Standard_User_Submitted_Resources_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "profile-edits",
    title: "Profile edits",
    summary: "How often each participant changed their profile.",
    group: "profile",
    legacyName: "Standard User profile edits Report",
    legacyPaths: ["/profile-edits", "/profile-edits-csv"],
    filename: "Standard_User_Profile_Edits_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: true,
  },
  {
    slug: "profile-avatars",
    title: "Profile avatars",
    summary: "The avatar each participant uses, and how often they changed it.",
    group: "profile",
    legacyName: "Standard User profile avatar Report",
    legacyPaths: ["/profile-avatar", "/profile-avatar-csv"],
    filename: "Standard_User_Profile_Avatar_Report.csv",
    defaultArm: "participant",
    requireSid: true,
    dated: false,
  },
  {
    slug: "surveys",
    title: "Survey completion",
    summary: "Baseline, midpoint and follow-up survey completion by study ID.",
    group: "surveys",
    legacyPaths: ["/survey_reports"],
    filename: "Survey_Completion_Report.csv",
    defaultArm: "study",
    requireSid: true,
    dated: true,
    badge: "New",
  },
];

export function reportMeta(slug: string) {
  return REPORTS.find((report) => report.slug === slug);
}

/** Peer Navigation reports built by the Peer Navigation area (linked from the hub). */
export const PEER_NAV_REPORTS = [
  {
    href: "/admin/reports/sessions",
    csv: "/admin/reports/sessions/csv",
    title: "Session report",
    summary: "Where each Peer Navigation participant is in the six sessions.",
    filename: "Coach_SessionReport.csv",
  },
  {
    href: "/admin/reports/peernav-usage",
    csv: "/admin/reports/peernav-usage/csv",
    title: "Peer Navigation usage",
    summary: "Sign-ins to Peer Navigation with device and session length.",
    filename: "eCoach_Standard_Usage_Report.csv",
  },
] as const;
