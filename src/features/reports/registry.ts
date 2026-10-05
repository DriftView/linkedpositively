import "server-only";
import { reportMeta, type ReportMeta } from "./catalog";
import type { ReportFilters } from "./filters";
import { accessReport } from "./queries/access";
import { contentWarningClicksReport, contentWarningReport, interactionReport, reactionsReport } from "./queries/community";
import { engagementReport } from "./queries/engagement";
import { commentsReport, ratingsReport, submittedResourcesReport } from "./queries/lists";
import { avatarReport, profileEditsReport, resourceViewsReport } from "./queries/profile";
import { studyManagementReport } from "./queries/study";
import { surveysReport } from "./queries/surveys";
import { tipMatrixReport } from "./queries/tips";
import { checkinReport, trackedItemsReport, trackerViewsReport } from "./queries/tracking";
import { usageReport } from "./queries/usage";
import type { ReportResult } from "./types";

type Runner = (meta: ReportMeta, filters: ReportFilters) => Promise<ReportResult>;

const RUNNERS: Record<string, Runner> = {
  usage: usageReport,
  engagement: engagementReport,
  access: accessReport,
  "study-management": studyManagementReport,
  interaction: interactionReport,
  reactions: reactionsReport,
  "content-warnings": contentWarningReport,
  "content-warning-clicks": contentWarningClicksReport,
  "tip-comments": (meta, filters) => commentsReport(meta, filters, "tip"),
  "tip-views": (meta, filters) => tipMatrixReport(meta, filters, "views"),
  "tip-favorites": (meta, filters) => tipMatrixReport(meta, filters, "favorites"),
  checkins: checkinReport,
  "tracker-views": trackerViewsReport,
  "tracked-items": trackedItemsReport,
  "resource-views": resourceViewsReport,
  "resource-comments": (meta, filters) => commentsReport(meta, filters, "resource"),
  "resource-ratings": ratingsReport,
  "submitted-resources": submittedResourcesReport,
  "profile-edits": profileEditsReport,
  "profile-avatars": avatarReport,
  surveys: surveysReport,
};

/** The catalog entry and runner for a slug, or null for an unknown report. */
export function findReport(slug: string) {
  const meta = reportMeta(slug);
  const run = meta ? RUNNERS[meta.slug] : undefined;
  return meta && run ? { meta, run: (filters: ReportFilters) => run(meta, filters) } : null;
}

/** Undated reports ignore the date filter (they're snapshots of today). */
export function effectiveFilters(meta: ReportMeta, filters: ReportFilters): ReportFilters {
  return meta.dated ? filters : { ...filters, from: undefined, to: undefined };
}
