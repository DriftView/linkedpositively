"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AnamClient } from "@anam-ai/js-sdk";
import { toast } from "sonner";
import { pcmChunks, PCM_SAMPLE_RATE, toPcm16 } from "../pcm";

/** Where the coach's voice goes when the video face is on (see useCoachVoice). */
export type VideoSink = {
  /** Sends one decoded sentence; the face says it and the voice plays from the video. */
  send: (buffer: AudioBuffer) => void;
  /** The reply's last sentence has been sent. */
  endTurn: () => void;
  /** Stops the face mid-sentence (barge-in, "Stop talking"). */
  interrupt: () => void;
  /** Something went wrong: drop back to the drawn coach. */
  fail: () => void;
};

export type VideoStatus = "off" | "connecting" | "live";

/**
 * The video coach (Anam): a lifelike face in place of the drawn
 * coach during a call. The server hands out a one-call session token; the
 * face lip-syncs the ElevenLabs audio we send it ("audio passthrough"), so it
 * never hears the member or writes replies. Any failure, or hiding the tab,
 * ends the video (so idle minutes aren't billed) and the drawn coach returns.
 */
export function useVideoCoach() {
  const videoId = `coach-video${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [status, setStatus] = useState<VideoStatus>("off");
  const sink = useRef<VideoSink | null>(null);
  const clientRef = useRef<AnamClient | null>(null);
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current++;
    sink.current = null;
    const client = clientRef.current;
    clientRef.current = null;
    if (client) void client.stopStreaming().catch(() => undefined);
    setStatus("off");
  }, []);

  const fail = useCallback(
    (message = "Video stopped. You're back to the drawn coach.") => {
      stop();
      toast.error(message);
    },
    [stop],
  );

  const start = useCallback(async () => {
    if (clientRef.current) return;
    const token = ++tokenRef.current;
    setStatus("connecting");
    try {
      const response = await fetch("/api/ai/avatar-session", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { sessionToken?: string; error?: string };
      if (!response.ok || !body.sessionToken) throw new Error(body.error ?? "Video service unavailable.");
      const { createClient, AnamEvent, ConnectionClosedCode } = await import("@anam-ai/js-sdk");
      if (tokenRef.current !== token) return;

      const client = createClient(body.sessionToken, {
        disableInputAudio: true, // the face never hears the member; our own mic handling does
        metrics: { disableClientMetrics: true },
      });
      clientRef.current = client;
      client.addListener(AnamEvent.CONNECTION_CLOSED, (code) => {
        if (clientRef.current !== client) return;
        if (code === ConnectionClosedCode.NORMAL) stop();
        else fail();
      });
      // The <video> renders while connecting; wait a frame so it's in the page.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await client.streamToVideoElement(videoId);
      if (tokenRef.current !== token) return;

      const input = client.createAgentAudioInputStream({
        encoding: "pcm_s16le",
        sampleRate: PCM_SAMPLE_RATE,
        channels: 1,
      });
      const guard = (action: () => void) => {
        try {
          action();
        } catch {
          if (clientRef.current === client) fail();
        }
      };
      sink.current = {
        send: (buffer) =>
          guard(() => {
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
            for (const chunk of pcmChunks(toPcm16(channels, buffer.sampleRate))) input.sendAudioChunk(chunk);
          }),
        endTurn: () => guard(() => input.endSequence()),
        interrupt: () =>
          guard(() => {
            client.interruptPersona();
            input.endSequence();
          }),
        fail: () => fail(),
      };
      setStatus("live");
    } catch (error) {
      if (tokenRef.current !== token) return;
      fail(error instanceof Error && error.message ? error.message : "Video isn't available right now.");
    }
  }, [fail, stop, videoId]);

  // Hiding the tab ends the video: no one is watching, and minutes are billed.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden" && clientRef.current) stop();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoId, status, sink, start, stop };
}

export type VideoCoach = ReturnType<typeof useVideoCoach>;
