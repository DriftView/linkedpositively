import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMIT_TIMEOUT_MS, LiveTranscriber, pcmToBase64 } from "./live-transcription";

/** Live transcription against a scripted ElevenLabs socket. */

class FakeSocket {
  static last: FakeSocket | null = null;
  url: string;
  sent: { message_type: string; audio_base_64: string; commit: boolean; sample_rate: number }[] = [];
  closed = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  /** A message from the server. */
  receive(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

let tokenStatus = 200;

beforeEach(() => {
  FakeSocket.last = null;
  tokenStatus = 200;
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      tokenStatus === 200
        ? Response.json({ token: "single-use" })
        : Response.json({ error: "unavailable" }, { status: tokenStatus }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function connected(onClose?: () => void) {
  const live = new LiveTranscriber(onClose);
  const ready = live.connect();
  await vi.waitFor(() => expect(FakeSocket.last).not.toBeNull());
  const socket = FakeSocket.last!;
  socket.receive({ message_type: "session_started", session_id: "s1" });
  expect(await ready).toBe(true);
  return { live, socket };
}

describe("LiveTranscriber", () => {
  it("opens a session with a single-use token and manual commits", async () => {
    const { socket } = await connected();
    const url = new URL(socket.url);
    expect(url.origin + url.pathname).toBe("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
    expect(url.searchParams.get("token")).toBe("single-use");
    expect(url.searchParams.get("commit_strategy")).toBe("manual");
    expect(url.searchParams.get("audio_format")).toBe("pcm_16000");
  });

  it("streams audio, then resolves a commit with the committed words", async () => {
    const { live, socket } = await connected();
    live.push(new Int16Array([1, 2, 3]));
    const words = live.commit(new Int16Array([4]));
    expect(socket.sent.map((message) => message.commit)).toEqual([false, true]);
    expect(socket.sent[0]).toMatchObject({ message_type: "input_audio_chunk", sample_rate: 16000 });
    socket.receive({ message_type: "partial_transcript", text: "what is" });
    socket.receive({ message_type: "committed_transcript", text: " What is PrEP? " });
    expect(await words).toBe("What is PrEP?");
  });

  it("drops a discarded turn's words so they never reach the next turn", async () => {
    const { live, socket } = await connected();
    live.discard();
    const words = live.commit(new Int16Array([1]));
    socket.receive({ message_type: "committed_transcript", text: "cut off" });
    socket.receive({ message_type: "committed_transcript", text: "the real turn" });
    expect(await words).toBe("the real turn");
  });

  it("gives up on a slow commit (null: use the recording) and ends the session", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { live, socket } = await connected(onClose);
    const words = live.commit(new Int16Array([1]));
    vi.advanceTimersByTime(COMMIT_TIMEOUT_MS + 1);
    expect(await words).toBeNull();
    expect(socket.closed).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(live.ready).toBe(false);
  });

  it("resolves pending turns with null when the session breaks", async () => {
    const onClose = vi.fn();
    const { live, socket } = await connected(onClose);
    const words = live.commit(new Int16Array([1]));
    socket.receive({ message_type: "transcriber_error", error: "boom" });
    expect(await words).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays off for the call after an auth or quota error", async () => {
    const { live, socket } = await connected();
    socket.receive({ message_type: "quota_exceeded" });
    expect(live.disabled).toBe(true);
    expect(await live.connect()).toBe(false);
  });

  it("stays off when the server has no live transcription", async () => {
    tokenStatus = 503;
    const live = new LiveTranscriber();
    expect(await live.connect()).toBe(false);
    expect(live.disabled).toBe(true);
    expect(await live.commit(new Int16Array([1]))).toBeNull();
  });

  it("treats a turn with no speech as empty words", async () => {
    const { live, socket } = await connected();
    const words = live.commit(new Int16Array(0));
    expect(socket.sent[0]!.audio_base_64.length).toBeGreaterThan(0); // a commit always carries some audio
    socket.receive({ message_type: "insufficient_audio_activity" });
    expect(await words).toBe("");
  });
});

describe("pcmToBase64", () => {
  it("encodes little-endian 16-bit samples", () => {
    expect(pcmToBase64(new Int16Array([1, -1]))).toBe(btoa(String.fromCharCode(1, 0, 255, 255)));
  });
});
