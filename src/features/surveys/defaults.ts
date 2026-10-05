import type { SurveyFieldTarget, SurveyKey } from "@/server/db/schema/surveys";

/**
 * The study's Qualtrics surveys as they were configured on the old site
 * (site configuration, not participant data): the baseline survey created
 * control accounts, the midpoint/follow-up survey updated them, and the
 * midpoint form URL was the `midpoint_url` variable.
 */

export type SurveyDefaults = {
  key: SurveyKey;
  title: string;
  url: string;
  qualtricsSurveyId: string;
  syncMode: "off" | "create_users" | "update_users";
  fieldMap: { source: string; target: SurveyFieldTarget }[];
  promptEnabled: boolean;
  openWeek: number;
  closeWeek: number;
};

const scales = [
  ...Array.from({ length: 9 }, (_, i) => `I${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `M${i + 1}`),
  ...Array.from({ length: 17 }, (_, i) => `B${i + 1}`),
].map((source) => ({ source, target: "extra" as const }));

export const DEFAULT_SURVEYS: SurveyDefaults[] = [
  {
    key: "baseline",
    title: "Baseline survey",
    url: "",
    qualtricsSurveyId: "SV_3Q1u2PtKqjJnsB7",
    syncMode: "create_users",
    fieldMap: [
      { source: "01", target: "studyId" },
      { source: "02", target: "username" },
      { source: "03", target: "email" },
      { source: "04", target: "phone" },
      ...scales,
    ],
    promptEnabled: false,
    openWeek: 1,
    closeWeek: 1,
  },
  {
    key: "midpoint",
    title: "Midpoint survey",
    url: "https://umn.qualtrics.com/jfe/form/SV_cCsRZVHope5XwtD",
    qualtricsSurveyId: "SV_cCsRZVHope5XwtD",
    syncMode: "update_users",
    fieldMap: [{ source: "Q1", target: "studyId" }, ...scales],
    promptEnabled: true,
    // Legacy uy_midpoint_notification: "ready" from week 10, "one more week" in week 11.
    openWeek: 10,
    closeWeek: 11,
  },
  {
    key: "followup",
    title: "Follow-up survey",
    url: "",
    qualtricsSurveyId: "",
    syncMode: "off",
    fieldMap: [{ source: "Q1", target: "studyId" }],
    promptEnabled: false,
    openWeek: 24,
    closeWeek: 24,
  },
];

/** Adds `?ID=<study id>` to a Qualtrics form URL (the legacy midpoint link format). */
export function surveyLink(url: string, studyId: string | null | undefined) {
  if (!url) return null;
  try {
    const link = new URL(url);
    if (studyId) link.searchParams.set("ID", studyId);
    return link.toString();
  } catch {
    return null;
  }
}

export type PromptStage = "ready" | "reminder" | "last";

/**
 * Where a participant is in a survey's window, by study week and day
 * (1-based). Legacy midpoint messages: "ready" (week 10), "one more week"
 * (week 11) and "last day".
 */
export function promptStage(week: number, day: number, openWeek: number, closeWeek: number): PromptStage | null {
  if (week < openWeek || week > closeWeek) return null;
  const lastDay = closeWeek * 7;
  if (day >= lastDay) return "last";
  if (week === openWeek) return "ready";
  return "reminder";
}

/** In-app copy, adapted from the legacy midpoint notifications. */
export function promptMessage(stage: PromptStage, name: string, title: string) {
  const survey = title.toLowerCase();
  switch (stage) {
    case "ready":
      return `Hello ${name}, your ${survey} is ready! This will only take 5-10 minutes to complete.`;
    case "reminder":
      return `Hello ${name}, you have one more week to take the ${survey}. Please take 5-10 minutes to complete it this week.`;
    case "last":
      return `Hello ${name}, this is your last day to take your ${survey}. Take it today!`;
  }
}
