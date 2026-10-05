import "server-only";
import { getDuePrompt } from "../service";
import { getViewer } from "@/server/auth/session";
import { SurveyPromptDialog } from "./survey-prompt-dialog";

/**
 * Drop-in for the participant layout: renders the survey pop-up when a
 * survey is due for the signed-in participant, nothing otherwise. Never
 * breaks the page (errors render nothing).
 */
export async function SurveyPrompt() {
  const viewer = await getViewer();
  if (!viewer || viewer.impersonatedBy) return null;
  const survey = await getDuePrompt({ id: viewer.id, name: viewer.name, timezone: viewer.timezone }).catch(() => null);
  if (!survey) return null;
  return <SurveyPromptDialog survey={survey} timezone={viewer.timezone} />;
}
