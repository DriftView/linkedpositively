import { getSettings } from "@/features/admin/settings";
import { can, type Viewer } from "@/server/auth/session";
import { videoConfigured } from "../avatar";
import { getPreferences } from "../queries";
import { voiceConfigured } from "../speech";
import { CoachLauncher } from "./coach-launcher";

/**
 * The floating coach on every page of a member layout. Only members who can use
 * the coach see it (never the study's control arm), and only while the coach is on.
 * The conversation itself loads when the member first opens it.
 */
export async function CoachLauncherSlot({ viewer, basePath }: { viewer: Viewer; basePath: string }) {
  if (!can(viewer, "ai.chat")) return null;
  const settings = await getSettings();
  if (!settings.aiCoachEnabled) return null;
  const preferences = await getPreferences(viewer.id);
  return (
    <CoachLauncher
      basePath={basePath}
      coachId={preferences.design.coachId}
      realistic={settings.aiVoiceEnabled && settings.aiVideoEnabled && voiceConfigured() && videoConfigured()}
      firstName={preferences.personalize ? viewer.name.split(" ")[0] || null : null}
      voiceEnabled={settings.aiVoiceEnabled}
      serverVoice={voiceConfigured()}
      impersonating={Boolean(viewer.impersonatedBy)}
    />
  );
}
