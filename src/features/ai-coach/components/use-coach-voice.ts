"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordClientEventAction } from "../actions";
import { takePrimedAudio } from "../audio-unlock";
import { base64ToPcm16, levelAt, pcm16ToFloat, STREAM_SAMPLE_RATE } from "../pcm";
import { speakableText } from "../prompt";
import type { SpeechChunkDTO } from "../types";
import { pickBrowserVoice, textToVisemes, visemeAt, type VisemeTrack, type VoiceGender } from "../voice-lib";
import { newFace, type CoachFace } from "./coach-avatar";
import type { VideoSink } from "./use-video-coach";

/** One sentence of a reply: its audio pieces as they arrive, or text for the browser's voice. */
type Sentence = {
  seq: number | null;
  text: string;
  /** Audio pieces in order (streamed PCM arrives in several; MP3 is one). */
  parts: Promise<AudioBuffer | null>[];
  /** Mouth shapes, timed from the sentence's start. */
  visemes: VisemeTrack;
  /** All its pieces are here. */
  complete: boolean;
  /** No audio: the browser's voice reads `text`. */
  browser: boolean;
  /** A backchannel ("Mm-hm.") said ahead of the reply: no caption, and back to thinking once said. */
  filler: boolean;
  /** When it started and (once known) ended, on the audio clock (seconds). */
  startAt: number | null;
  endAt: number | null;
  wake: (() => void) | null;
};

/** A piece of audio placed on the audio clock. */
type Segment = { start: number; end: number; sentence: Sentence; samples: Float32Array; rate: number; video: boolean };

/** Fading out instead of cutting: no click when the member interrupts. */
const FADE_S = 0.04;
/** Lead time when scheduling, so the first sample isn't late. */
const LEAD_S = 0.02;
/** Audio waiting this long on a context the browser won't start (no tap yet): give up instead of hanging. */
const STALL_MS = 1500;
/** About how long the browser's voice takes per character (for what was heard of a sentence). */
const BROWSER_S_PER_CHAR = 0.065;

function audioContextClass() {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

function base64ToBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function newSentence(text: string, seq: number | null, filler = false): Sentence {
  return {
    seq,
    text,
    parts: [],
    visemes: [],
    complete: false,
    browser: false,
    filler,
    startAt: null,
    endAt: null,
    wake: null,
  };
}

/**
 * Speaks the coach's replies and drives the avatar's face.
 *
 * A reply arrives as sentences: `begin(id)`, then `enqueue()` each piece as it
 * streams in, then `end()`. Streamed replies come as raw PCM pieces (several
 * per sentence, as ElevenLabs makes them), which are placed back to back on
 * the Web Audio clock as soon as they arrive, so the coach starts talking on
 * the first piece and there are no gaps between sentences. Saved replies,
 * previews and backchannels are MP3. One audio context, unlocked on the
 * member's first tap (which also makes iOS play later audio). The mouth
 * follows the audio's visemes and loudness. Sentences without audio are read
 * by the browser's own voice, with estimated mouth shapes per word.
 * `speak(id, text)` replays a saved reply the same way.
 *
 * `stop()` fades the voice out at once and drops everything queued;
 * `heard()` says how much of the reply the member actually heard (for an
 * interruption).
 *
 * When `video` holds a sink (the video coach is live), the audio goes to the
 * video face instead of the speakers: the face says it and its stream carries
 * the voice. The timeline is kept the same way, so captions, "speaking" and
 * hands-free turn-taking work the same.
 */
export function useCoachVoice({
  pitch = 1,
  gender = null,
  onIdle,
  onSpeechStart,
  onStall,
  video,
}: {
  pitch?: number;
  /** The coach's browser voice when ElevenLabs isn't available (a female coach gets a female voice). */
  gender?: VoiceGender | null;
  onIdle?: () => void;
  /** The reply's first words are being heard (not a backchannel). */
  onSpeechStart?: () => void;
  /** The browser wouldn't start the audio (no tap on the page yet): the reply was dropped. */
  onStall?: () => void;
  video?: React.RefObject<VideoSink | null>;
} = {}) {
  const face = useRef<CoachFace>(newFace());
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  /** This reply's volume: faded out on stop, then replaced. */
  const gainRef = useRef<GainNode | null>(null);
  const sentencesRef = useRef<Sentence[]>([]);
  const bySeqRef = useRef(new Map<number, Sentence>());
  /** This reply's sentences in order (backchannels aside), for heard(). */
  const spokenRef = useRef<Sentence[]>([]);
  const stallSinceRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  /** Where the next piece of audio goes on the audio clock. */
  const nextAtRef = useRef(0);
  const endedRef = useRef(true);
  const pumpingRef = useRef(false);
  /** The browser's voice is reading a sentence. */
  const browserSpeakingRef = useRef(false);
  /** A sentence other than a backchannel has started: the reply is being heard. */
  const startedRef = useRef(false);
  const frameRef = useRef(0);
  const captionRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  const idRef = useRef<string | null>(null);
  const reportedRef = useRef(false);
  /** The video sink that got this reply's audio, so it can be ended or interrupted. */
  const videoTurnRef = useRef<VideoSink | null>(null);
  const pitchRef = useRef(pitch);
  const genderRef = useRef(gender);
  const onIdleRef = useRef(onIdle);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onStallRef = useRef(onStall);
  const videoRef = useRef(video);
  useEffect(() => {
    pitchRef.current = pitch;
    genderRef.current = gender;
    onIdleRef.current = onIdle;
    onSpeechStartRef.current = onSpeechStart;
    onStallRef.current = onStall;
    videoRef.current = video;
  }, [pitch, gender, onIdle, onSpeechStart, onStall, video]);

  // Some browsers load their voice list in the background: ask early, so the first browser-read reply gets the right voice.
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  const freshGain = useCallback((context: AudioContext, analyser: AnalyserNode) => {
    const gain = context.createGain();
    gain.connect(analyser);
    gainRef.current = gain;
    return gain;
  }, []);

  /** Creates or resumes the audio context. Call from a tap or key press (browsers only allow audio after one). */
  const unlock = useCallback(() => {
    const Context = audioContextClass();
    if (!Context) return null;
    if (!contextRef.current) {
      let context: AudioContext;
      try {
        // The one the login button unlocked, if it's still here (audio-unlock.ts); else a new one.
        context = takePrimedAudio() ?? new Context();
      } catch {
        return null; // too many audio contexts, or audio blocked: the browser's voice reads replies
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(context.destination);
      contextRef.current = context;
      analyserRef.current = analyser;
      freshGain(context, analyser);
    }
    // "suspended" until a tap; Safari can also be "interrupted" (a call, another app's audio).
    if (contextRef.current.state !== "running") void contextRef.current.resume().catch(() => undefined);
    return contextRef.current;
  }, [freshGain]);

  /** Silences everything now: a quick fade on the speakers, the browser's voice cancelled. */
  const silence = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    face.current.level = 0;
    face.current.viseme = "rest";
    const context = contextRef.current;
    const gain = gainRef.current;
    const sources = sourcesRef.current;
    sourcesRef.current = [];
    if (context && gain && analyserRef.current) {
      const now = context.currentTime;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + FADE_S);
      } catch {
        // closed context
      }
      for (const source of sources) {
        try {
          source.stop(now + FADE_S + 0.01);
        } catch {
          // already stopped
        }
      }
      setTimeout(() => gain.disconnect(), (FADE_S + 0.05) * 1000);
      freshGain(context, analyserRef.current);
    }
    segmentsRef.current = [];
    nextAtRef.current = 0;
    browserSpeakingRef.current = false;
    stallSinceRef.current = null;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [freshGain]);

  const finish = useCallback(() => {
    videoTurnRef.current?.endTurn();
    videoTurnRef.current = null;
    silence();
    sentencesRef.current = [];
    bySeqRef.current.clear();
    spokenRef.current = [];
    pumpingRef.current = false;
    startedRef.current = false;
    idRef.current = null;
    captionRef.current = null;
    setSpeakingId(null);
    setLoadingId(null);
    setCaption(null);
    onIdleRef.current?.();
  }, [silence]);

  const stop = useCallback(() => {
    const wasActive = idRef.current !== null;
    tokenRef.current++;
    videoTurnRef.current?.interrupt();
    videoTurnRef.current = null;
    for (const sentence of sentencesRef.current) sentence.wake?.();
    sentencesRef.current = [];
    bySeqRef.current.clear();
    spokenRef.current = [];
    endedRef.current = true;
    silence();
    pumpingRef.current = false;
    startedRef.current = false;
    idRef.current = null;
    captionRef.current = null;
    setSpeakingId(null);
    setLoadingId(null);
    setCaption(null);
    return wasActive;
  }, [silence]);

  // Leaving: stop, and free the audio context (browsers allow only a few at once).
  useEffect(
    () => () => {
      stop();
      const context = contextRef.current;
      contextRef.current = null;
      analyserRef.current = null;
      gainRef.current = null;
      void context?.close().catch(() => undefined);
    },
    [stop],
  );

  /** Marks the reply as being heard (first words, not a backchannel). */
  const markStarted = useCallback((sentence: Sentence) => {
    if (sentence.filler || startedRef.current) return;
    startedRef.current = true;
    setLoadingId(null);
    onSpeechStartRef.current?.();
  }, []);

  /**
   * One loop per reply while audio is on the clock: the face (loudness, mouth),
   * the caption, "speaking", and going idle once everything has played.
   */
  const tick = useCallback(() => {
    const context = contextRef.current;
    const analyser = analyserRef.current;
    if (!context) {
      // No Web Audio: only the browser's voice speaks.
      if (!browserSpeakingRef.current && !pumpingRef.current && endedRef.current && idRef.current !== null) {
        frameRef.current = 0;
        finish();
      } else frameRef.current = requestAnimationFrame(tick);
      return;
    }
    // Audio waiting on a context the browser won't start: drop the reply rather than hang "speaking" forever.
    if (context.state !== "running" && segmentsRef.current.length && !browserSpeakingRef.current) {
      stallSinceRef.current ??= performance.now();
      if (performance.now() - stallSinceRef.current > STALL_MS) {
        frameRef.current = 0;
        stop();
        onStallRef.current?.();
        onIdleRef.current?.();
        return;
      }
    } else stallSinceRef.current = null;
    const now = context.currentTime;
    const segment = segmentsRef.current.find((item) => item.start <= now && now < item.end) ?? null;
    if (browserSpeakingRef.current) {
      // speakWithBrowser drives the face itself.
    } else if (segment) {
      const sentence = segment.sentence;
      if (segment.video) face.current.level = levelAt(segment.samples, segment.rate, (now - segment.start) * 1000);
      else if (analyser) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) sum += ((sample - 128) / 128) ** 2;
        face.current.level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
      }
      const ms = (now - (sentence.startAt ?? segment.start)) * 1000;
      face.current.viseme =
        sentence.visemes.length > 1
          ? visemeAt(sentence.visemes, ms)
          : face.current.level > 0.45
            ? "A"
            : face.current.level > 0.15
              ? "L"
              : "rest";
      if (!sentence.filler && captionRef.current !== sentence.text) {
        captionRef.current = sentence.text;
        setCaption(sentence.text);
      }
      markStarted(sentence);
      setSpeakingId(idRef.current);
    } else {
      face.current.level = 0;
      face.current.viseme = "rest";
      // Only a backchannel has played so far: back to "thinking" until the reply's audio arrives.
      if (!startedRef.current) setSpeakingId(null);
    }
    // Drop what has played.
    while (segmentsRef.current.length && segmentsRef.current[0]!.end <= now) segmentsRef.current.shift();
    const busy = browserSpeakingRef.current || pumpingRef.current || now < nextAtRef.current;
    if (!busy && endedRef.current && idRef.current !== null) {
      frameRef.current = 0;
      finish();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [finish, markStarted, stop]);

  const ensureTicking = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  /** Places one piece of audio right after the last one (or now, if the voice has caught up). */
  const schedule = useCallback(
    (sentence: Sentence, buffer: AudioBuffer) => {
      const context = contextRef.current;
      const gain = gainRef.current;
      if (!context || !gain) return;
      const start = Math.max(context.currentTime + LEAD_S, nextAtRef.current);
      const end = start + buffer.duration;
      nextAtRef.current = end;
      sentence.startAt ??= start;
      sentence.endAt = end;
      const sink = videoRef.current?.current;
      const samples = buffer.getChannelData(0);
      if (sink) {
        // The face says it: its own stream carries the voice and keeps it in order.
        videoTurnRef.current = sink;
        sink.send(buffer);
      } else {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start(start);
        sourcesRef.current.push(source);
        source.onended = () => {
          sourcesRef.current = sourcesRef.current.filter((item) => item !== source);
        };
      }
      segmentsRef.current.push({ start, end, sentence, samples, rate: buffer.sampleRate, video: Boolean(sink) });
      ensureTicking();
      // A hidden tab pauses animation frames but not audio: check for the end of the reply by timer too.
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => {
          idleTimerRef.current = null;
          if (document.hidden) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = 0;
            tick();
          }
        },
        (end - context.currentTime) * 1000 + 150,
      );
    },
    [ensureTicking, tick],
  );

  const speakWithBrowser = useCallback((text: string, token: number) => {
    return new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || tokenRef.current !== token)
        return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = pitchRef.current;
      const preferred = pickBrowserVoice(window.speechSynthesis.getVoices(), genderRef.current);
      if (preferred) utterance.voice = preferred;
      let track: VisemeTrack = [];
      let wordStart = performance.now();
      let frame = 0;
      utterance.onboundary = (event) => {
        // The browser only says where each word starts: estimate its mouth shapes.
        const word = text.slice(
          event.charIndex,
          event.charIndex + (event.charLength || text.slice(event.charIndex).search(/\s|$/)),
        );
        wordStart = performance.now();
        track = textToVisemes(word, 75);
      };
      const tick = () => {
        const ms = performance.now() - wordStart;
        face.current.viseme = visemeAt(track, ms);
        face.current.level = face.current.viseme === "rest" ? 0 : 0.55;
        frame = requestAnimationFrame(tick);
      };
      utterance.onstart = () => {
        frame = requestAnimationFrame(tick);
      };
      const done = () => {
        cancelAnimationFrame(frame);
        face.current.level = 0;
        face.current.viseme = "rest";
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
      if (!reportedRef.current) {
        reportedRef.current = true;
        void recordClientEventAction({ event: "voice_output" });
      }
    });
  }, []);

  /** Waits until the scheduled audio has played (before the browser's voice takes a turn). */
  const drained = useCallback((token: number) => {
    return new Promise<void>((resolve) => {
      const check = () => {
        const context = contextRef.current;
        if (tokenRef.current !== token || !context || context.currentTime >= nextAtRef.current) return resolve();
        setTimeout(check, 30);
      };
      check();
    });
  }, []);

  /** Works through the reply's sentences in order, placing each piece as soon as it arrives. */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    const token = tokenRef.current;
    ensureTicking();
    while (tokenRef.current === token) {
      const sentence = sentencesRef.current[0];
      if (!sentence) break;
      if (sentence.browser) {
        if (sentence.filler) {
          sentencesRef.current.shift();
          continue; // never in the browser's voice
        }
        await drained(token);
        if (tokenRef.current !== token) return;
        browserSpeakingRef.current = true;
        markStarted(sentence);
        captionRef.current = sentence.text;
        setCaption(sentence.text);
        setSpeakingId(idRef.current);
        sentence.startAt = contextRef.current?.currentTime ?? 0;
        await speakWithBrowser(sentence.text, token);
        if (tokenRef.current !== token) return;
        browserSpeakingRef.current = false;
        sentence.endAt = contextRef.current?.currentTime ?? 0;
        if (contextRef.current) nextAtRef.current = contextRef.current.currentTime;
        sentencesRef.current.shift();
        continue;
      }
      let index = 0;
      for (;;) {
        if (index < sentence.parts.length) {
          const buffer = await sentence.parts[index]!;
          if (tokenRef.current !== token) return;
          index++;
          if (buffer) schedule(sentence, buffer);
          continue;
        }
        if (sentence.complete) break;
        // Wait for the next piece (or the sentence to close).
        await new Promise<void>((resolve) => (sentence.wake = resolve));
        sentence.wake = null;
        if (tokenRef.current !== token) return;
      }
      // A sentence whose audio all failed: the browser reads it instead.
      if (sentence.startAt === null && !sentence.filler) {
        sentence.browser = true;
        continue;
      }
      sentencesRef.current.shift();
    }
    if (tokenRef.current !== token) return;
    pumpingRef.current = false;
    ensureTicking(); // goes idle once the scheduled audio has played
  }, [drained, ensureTicking, markStarted, schedule, speakWithBrowser]);

  /** Starts speaking a reply that is still streaming. */
  const begin = useCallback(
    (id: string) => {
      stop();
      unlock();
      idRef.current = id;
      endedRef.current = false;
      reportedRef.current = false;
      setLoadingId(id);
    },
    [stop, unlock],
  );

  const pcmBuffer = useCallback((base64: string) => {
    const context = contextRef.current;
    if (!context) return null;
    const samples = pcm16ToFloat(base64ToPcm16(base64));
    if (!samples.length) return null;
    const buffer = context.createBuffer(1, samples.length, STREAM_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }, []);

  /**
   * Adds a piece of the reply: streamed PCM (part of sentence `seq`), MP3 for a
   * whole sentence, or text for the browser's voice. `filler`: see Sentence.
   */
  const enqueue = useCallback(
    (
      chunk: Pick<SpeechChunkDTO, "text"> &
        Partial<Pick<SpeechChunkDTO, "seq" | "audio" | "visemes" | "format" | "part" | "last">>,
      { filler = false } = {},
    ) => {
      if (idRef.current === null) return;
      const context = contextRef.current;
      if (chunk.format === "pcm" && chunk.seq !== undefined) {
        let sentence = bySeqRef.current.get(chunk.seq);
        if (!sentence) {
          sentence = newSentence(chunk.text, chunk.seq);
          bySeqRef.current.set(chunk.seq, sentence);
          sentencesRef.current.push(sentence);
          spokenRef.current.push(sentence);
        }
        if (chunk.audio) {
          sentence.parts.push(Promise.resolve(pcmBuffer(chunk.audio)));
          if (chunk.visemes?.length) sentence.visemes = [...sentence.visemes, ...chunk.visemes];
        }
        if (chunk.last) sentence.complete = true;
        sentence.wake?.();
      } else {
        const sentence = newSentence(chunk.text, chunk.seq ?? null, filler);
        sentence.complete = true;
        if (chunk.audio && context) {
          sentence.parts.push(context.decodeAudioData(base64ToBuffer(chunk.audio)).catch(() => null));
          sentence.visemes = chunk.visemes ?? [];
        } else sentence.browser = true;
        if (sentence.seq !== null && !filler) bySeqRef.current.set(sentence.seq, sentence);
        if (!filler) spokenRef.current.push(sentence);
        sentencesRef.current.push(sentence);
      }
      void pump();
    },
    [pcmBuffer, pump],
  );

  /** No more pieces for this reply; goes idle once everything has played. */
  const end = useCallback(() => {
    if (idRef.current === null) return;
    endedRef.current = true;
    // Streamed sentences that never got their closing piece (the stream ended): nothing more is coming.
    for (const sentence of sentencesRef.current) {
      sentence.complete = true;
      sentence.wake?.();
    }
    ensureTicking();
  }, [ensureTicking]);

  /** The reply's id changed (the streamed placeholder was saved). */
  const rename = useCallback((from: string, to: string) => {
    if (idRef.current !== from) return;
    idRef.current = to;
    setSpeakingId((current) => (current === from ? to : current));
    setLoadingId((current) => (current === from ? to : current));
  }, []);

  /**
   * What the member has heard of the reply so far: the sentences that have
   * played, and the part of the current one (by time). Null when nothing was
   * heard yet. Call before `stop()`.
   */
  const heard = useCallback(() => {
    const now = contextRef.current?.currentTime ?? 0;
    const words: string[] = [];
    for (const sentence of spokenRef.current) {
      if (sentence.startAt === null || sentence.startAt > now) break;
      // Its length: known once all its audio is placed; else (still arriving, or the browser's voice) estimated.
      const estimated = sentence.startAt + sentence.text.length * BROWSER_S_PER_CHAR;
      const end =
        sentence.browser && sentence.endAt === null
          ? estimated
          : sentence.complete
            ? (sentence.endAt ?? estimated)
            : Math.max(sentence.endAt ?? 0, estimated);
      if (sentence.endAt !== null && sentence.complete && end <= now) {
        words.push(sentence.text);
        continue;
      }
      // Partway through: about as much of the text as of its audio so far.
      const share = end > sentence.startAt ? Math.min(1, (now - sentence.startAt) / (end - sentence.startAt)) : 1;
      const cut = sentence.text.slice(0, Math.round(sentence.text.length * share));
      const space = cut.lastIndexOf(" ");
      words.push(`${space > 0 ? cut.slice(0, space) : cut}…`);
      break;
    }
    return words.length ? words.join(" ") : null;
  }, []);

  /** Reads a saved reply aloud, or plays a voice preview (`body`) in the coach picker. */
  const speak = useCallback(
    async (id: string, text: string, body: object = { messageId: id }) => {
      begin(id);
      const token = tokenRef.current;
      try {
        const response = await fetch("/api/ai/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(String(response.status));
        const chunk = (await response.json()) as SpeechChunkDTO;
        if (tokenRef.current !== token) return;
        enqueue(chunk);
      } catch {
        if (tokenRef.current !== token) return;
        // ElevenLabs unavailable: the browser's voice reads it.
        enqueue({ text: speakableText(text) });
      }
      if (tokenRef.current === token) end();
    },
    [begin, end, enqueue],
  );

  return { face, speakingId, loadingId, caption, unlock, begin, enqueue, end, rename, speak, stop, heard };
}

export type CoachVoice = ReturnType<typeof useCoachVoice>;
