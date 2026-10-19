import { PCM_SAMPLE_RATE } from "./pcm";

/**
 * Live transcription for voice chat (ElevenLabs real-time speech to text).
 * Audio is streamed while the member talks, so their words are ready as soon
 * as they stop, instead of uploading the recording afterwards. Our own voice
 * detection decides when a turn ends (`commit`); ElevenLabs only transcribes.
 * Every failure resolves to null, and the caller falls back to uploading the
 * turn's recording. Client-side; no server imports.
 */

const REALTIME_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
/** A turn's words should arrive well within this; otherwise use the recording. */
export const COMMIT_TIMEOUT_MS = 4000;
/** Server messages that end the session for good (no point reconnecting this call). */
const FATAL = new Set(["auth_error", "quota_exceeded"]);
/** Server messages that mean the session is unusable now. */
const BROKEN = new Set([
  "error",
  "session_time_limit_exceeded",
  "transcriber_error",
  "invalid_request",
  "input_error",
  "chunk_size_exceeded",
  "rate_limited",
]);

type Waiter = { resolve: (text: string | null) => void; timer: ReturnType<typeof setTimeout> };

/** Little-endian bytes of 16-bit PCM, base64-encoded. */
export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  pcm.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export class LiveTranscriber {
  private socket: WebSocket | null = null;
  private waiters: Waiter[] = [];
  private isReady = false;
  /** A permanent failure (bad key, out of quota): stay on uploads for the rest of the call. */
  disabled = false;

  /** `onClose` runs when a session ends unexpectedly (the caller may reconnect). */
  constructor(private readonly onClose: () => void = () => undefined) {}

  get ready() {
    return this.isReady && !this.disabled;
  }

  /** Opens a session. Resolves to whether it is ready. */
  async connect(): Promise<boolean> {
    if (this.disabled || this.socket) return this.ready;
    let token: string | undefined;
    try {
      const response = await fetch("/api/ai/transcription-token", { method: "POST" });
      if (response.status === 403 || response.status === 503) this.disabled = true;
      if (!response.ok) return false;
      token = ((await response.json()) as { token?: string }).token;
    } catch {
      return false;
    }
    if (!token || this.disabled) return false;

    const params = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      token,
      audio_format: `pcm_${PCM_SAMPLE_RATE}`,
      commit_strategy: "manual",
    });
    const socket = new WebSocket(`${REALTIME_URL}?${params}`);
    this.socket = socket;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      socket.onmessage = (event) => {
        let data: { message_type?: string; text?: string };
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const type = data.message_type ?? "";
        if (type === "session_started") {
          this.isReady = true;
          settle(true);
        } else if (type === "committed_transcript") {
          this.settleNext(typeof data.text === "string" ? data.text.trim() : "");
        } else if (type === "insufficient_audio_activity") {
          this.settleNext(""); // nothing worth transcribing in that turn
        } else if (type === "commit_throttled") {
          this.settleNext(null);
        } else if (FATAL.has(type)) {
          this.disabled = true;
          this.drop(socket);
        } else if (BROKEN.has(type)) {
          this.drop(socket);
        }
      };
      socket.onclose = () => {
        settle(false);
        if (this.socket !== socket) return;
        this.reset();
        this.onClose();
      };
      socket.onerror = () => settle(false);
    });
  }

  /** Streams a piece of the member's turn (16 kHz PCM). */
  push(pcm: Int16Array) {
    if (!this.ready || !pcm.length) return;
    this.send(pcm, false);
  }

  /** Ends the turn with its last audio. Resolves to the words (possibly ""), or null if live transcription failed. */
  commit(last: Int16Array): Promise<string | null> {
    if (!this.ready) return Promise.resolve(null);
    return new Promise((resolve) => {
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          // Too slow: give up on this session (late words would land on the wrong turn).
          const socket = this.socket;
          if (socket) this.drop(socket);
          else resolve(null);
        }, COMMIT_TIMEOUT_MS),
      };
      this.waiters.push(waiter);
      // A commit needs some audio: a few milliseconds of silence when the turn ended exactly on a send.
      this.send(last.length ? last : new Int16Array(PCM_SAMPLE_RATE / 100), true);
    });
  }

  /** Abandons the turn so far (the member was interrupted or muted): its words are dropped. */
  discard() {
    if (this.ready) void this.commit(new Int16Array(0));
  }

  close() {
    const socket = this.socket;
    this.reset();
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  }

  private send(pcm: Int16Array, commit: boolean) {
    try {
      this.socket?.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: pcmToBase64(pcm),
          commit,
          sample_rate: PCM_SAMPLE_RATE,
        }),
      );
    } catch {
      if (this.socket) this.drop(this.socket);
    }
  }

  private settleNext(text: string | null) {
    const waiter = this.waiters.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiter.resolve(text);
  }

  /** Ends a broken session: pending turns fall back to their recordings. */
  private drop(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.reset();
    socket.onclose = null;
    socket.close();
    this.onClose();
  }

  private reset() {
    this.socket = null;
    this.isReady = false;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
  }
}
