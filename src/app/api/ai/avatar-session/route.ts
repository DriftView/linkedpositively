import { getSettings } from "@/features/admin/settings";
import { createAvatarSession, videoConfigured } from "@/features/ai-coach/avatar";
import { resolveCoach } from "@/features/ai-coach/coach-design";
import { getPreferences } from "@/features/ai-coach/queries";
import { voiceConfigured } from "@/features/ai-coach/speech";
import { AuthError, assertPermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

/**
 * A short-lived Anam session token for one video call, for the member's
 * chosen coach (never an avatar the browser names). Needs the coach,
 * voice and video settings on, and ElevenLabs, since Anam lip-syncs our audio.
 */
export async function POST() {
  let viewer;
  try {
    viewer = await assertPermission("ai.chat");
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.message : "Please sign in again." },
      { status: 403 },
    );
  }
  const settings = await getSettings();
  if (!settings.aiCoachEnabled || !settings.aiVoiceEnabled || !settings.aiVideoEnabled)
    return Response.json({ error: "Video is switched off." }, { status: 403 });
  if (!videoConfigured() || !voiceConfigured())
    return Response.json({ error: "Video isn't set up." }, { status: 503 });

  const coach = resolveCoach((await getPreferences(viewer.id)).design);
  const sessionToken = await createAvatarSession(coach.anamAvatarId);
  if (!sessionToken) return Response.json({ error: "Video service unavailable." }, { status: 503 });
  await trackUsage(viewer.id, "ai_video_session", { provider: "anam", coach: coach.id });
  return Response.json({ sessionToken }, { headers: { "cache-control": "private, no-store" } });
}
