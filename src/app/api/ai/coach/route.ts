import { loadCoach } from "@/features/ai-coach/load";
import { AuthError, assertPermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

/**
 * The floating coach's data, loaded when the member first opens it (so other
 * pages pay nothing for it). `?c=` opens a conversation, `?c=new` starts one,
 * and no `c` resumes a recent conversation.
 */
export async function GET(request: Request) {
  let viewer;
  try {
    viewer = await assertPermission("ai.chat");
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.message : "Please sign in again." },
      { status: 403 },
    );
  }
  const c = new URL(request.url).searchParams.get("c");
  const data = await loadCoach(viewer, c === "new" ? null : (c ?? "latest"));
  if (!data) return Response.json({ error: "The AI coach isn't available right now." }, { status: 503 });
  if (!c) await trackUsage(viewer.id, "ai_coach_view", { resumed: Boolean(data.conversationId), source: "launcher" });
  return Response.json(data, { headers: { "cache-control": "private, no-store" } });
}
