import { getSettings } from "@/features/admin/settings";
import { resolveCoach } from "@/features/ai-coach/coach-design";
import { ChatError, runChatTurn } from "@/features/ai-coach/engine";
import { getPreferences } from "@/features/ai-coach/queries";
import { chatRequestSchema } from "@/features/ai-coach/schemas";
import { voiceConfigured } from "@/features/ai-coach/speech";
import { createSpeechStream } from "@/features/ai-coach/speech-stream";
import type { AiStreamEvent } from "@/features/ai-coach/types";
import { AuthError, assertPermission } from "@/server/auth/session";
import { logger } from "@/server/logger";
import { trackUsage } from "@/server/services/usage";

/** A reply can include several tool rounds; give it time. */
export const maxDuration = 120;

/**
 * Sends a message to the AI Coach and streams the reply as NDJSON
 * (one AiStreamEvent per line). The turn finishes and is saved even if the
 * member closes the page midway. With `speak`, the reply is also streamed as
 * speech, sentence by sentence (speech-stream.ts), before `done`.
 */
export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await assertPermission("ai.chat");
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.message : "Please sign in again." },
      { status: 403 },
    );
  }

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid message." }, { status: 400 });
  const body = parsed.data;
  const speak = Boolean(body.speak) && voiceConfigured() && (await getSettings()).aiVoiceEnabled;
  const voice = speak ? resolveCoach((await getPreferences(viewer.id)).design).voice : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AiStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the member left; keep going so the turn is saved
        }
      };
      // Speech stops when the member leaves (no one to hear it); the turn itself still finishes.
      const speech = voice ? createSpeechStream({ voice, emit: send, signal: request.signal }) : null;
      let done: AiStreamEvent | null = null;
      const emit = (event: AiStreamEvent) => {
        if (speech && event.type === "text") speech.push(event.delta);
        if (speech && event.type === "done")
          done = event; // sent once the speech has caught up
        else send(event);
      };
      try {
        await runChatTurn({
          viewer,
          conversationId: body.conversationId ?? null,
          text: body.text,
          near: body.near ?? null,
          viaVoice: Boolean(body.viaVoice),
          handsFree: Boolean(body.handsFree),
          emit,
        });
        if (speech && (await speech.finish()))
          await trackUsage(viewer.id, "ai_voice_output", { provider: "elevenlabs", streamed: true });
        if (done) send(done);
      } catch (error) {
        if (error instanceof ChatError) send({ type: "error", message: error.message });
        else {
          logger.error(
            { userId: viewer.id, err: error instanceof Error ? error.message : String(error) },
            "ai chat failed",
          );
          send({
            type: "error",
            message: "Something went wrong. Please try again. If you're in danger, call 911 or call or text 988.",
          });
        }
      } finally {
        if (open) controller.close();
        open = false;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
