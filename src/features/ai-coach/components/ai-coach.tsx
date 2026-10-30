"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Ellipsis,
  History,
  LifeBuoy,
  LocateFixed,
  Maximize2,
  Mic,
  Phone,
  Plus,
  Send,
  Settings2,
  Square,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { AutoTextarea } from "@/features/peer-nav/components/auto-textarea";
import { cn } from "@/lib/utils";
import { feedbackAction } from "../actions";
import type { AiCoachId } from "@/server/db/schema/ai";
import { BACKCHANNELS, coachVoice, resolveCoach } from "../coach-design";
import { MAX_MESSAGE_LENGTH, STARTER_PROMPTS } from "../constants";
import { speakableText } from "../prompt";
import type { AiCards, AiCoachData, AiStreamEvent, ChatMessageDTO, SpeechChunkDTO } from "../types";
import { SpeechChunker, voiceGenderFor } from "../voice-lib";
import type { CoachState } from "./coach-avatar";
import { CoachCall } from "./coach-call";
import { CoachPicker } from "./coach-picker";
import { CoachPortrait } from "./coach-portrait";
import { HelpSheet, HistorySheet, SettingsSheet } from "./coach-sheets";
import { CoachMarkdown, CrisisCard, ReplyCards } from "./reply-cards";
import { useCoachVoice } from "./use-coach-voice";
import { useHandsFree } from "./use-hands-free";
import { useTalkOver } from "./use-talk-over";
import { useVideoCoach } from "./use-video-coach";
import { useVoiceInput } from "./use-voice-input";

type Props = AiCoachData & {
  basePath: string;
  /** "panel": the floating coach (coach-launcher.tsx), which opens conversations in place instead of navigating. */
  variant?: "page" | "panel";
  /** Panel only: open a conversation (null starts a new one). */
  onOpenConversation?: (conversationId: string | null) => void;
  /** Panel only: minimize the panel. */
  onClose?: () => void;
  /** The member chose another coach. */
  onCoachChange?: (coachId: AiCoachId) => void;
};

const PENDING = "pending";

function highestCrisis(messages: ChatMessageDTO[]) {
  let level: "elevated" | "urgent" | null = null;
  for (const message of messages) {
    const crisis = message.cards?.crisis?.level;
    if (crisis === "urgent") return "urgent";
    if (crisis === "elevated") level = "elevated";
  }
  return level;
}

type SendOptions = {
  viaVoice?: boolean;
  handsFree?: boolean;
  /** When the member's turn ended and their words were ready (performance.now), for the voice timing log. */
  turn?: { endedAt: number; transcribedAt: number };
};

/** Development: one line per spoken turn with where the time went (ms after the member stopped talking). */
const LOG_VOICE_TIMING = process.env.NODE_ENV === "development";

/**
 * The AI Coach conversation: the animated coach, the messages with their
 * cards, and a composer that takes text or voice. Replies stream in from
 * POST /api/ai/chat (NDJSON, see types.ts AiStreamEvent); when the reply is
 * to be heard, it is spoken sentence by sentence as it streams. Hands-free
 * voice chat opens a full-screen call with the coach (coach-call.tsx): the
 * member just talks. Where the video coach is available, a lifelike face plays
 * the coach for the whole call (use-video-coach.ts); the drawn coach stands in
 * when it isn't.
 */
export function AiCoach(props: Props) {
  const router = useRouter();
  const panel = props.variant === "panel";
  // The page shows the coach stage beside the chat on large screens; the panel is always compact.
  const compactOnly = panel ? undefined : "lg:hidden";
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [title, setTitle] = useState(props.title);
  const [messages, setMessages] = useState<ChatMessageDTO[]>(props.initialMessages);
  const [conversations, setConversations] = useState(props.conversations);
  const [preferences, setPreferences] = useState(props.preferences);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [liveCrisis, setLiveCrisis] = useState<"elevated" | "urgent" | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [sheet, setSheet] = useState<"history" | "settings" | "help" | "coach" | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const queuedRef = useRef<{ text: string; options: SendOptions } | null>(null);
  /** The reply streaming in now, so the member can cut it off (barge-in). */
  const abortRef = useRef<AbortController | null>(null);
  /** What the member heard of a reply they interrupted: sent with their next message (if soon). */
  const interruptedRef = useRef<{ heard: string; at: number } | null>(null);
  /** The reply the latest message got, while it's the one being spoken (an interruption is about it). */
  const liveReplyRef = useRef<string | null>(null);
  /** This turn's voice timing (development log). */
  const timingRef = useRef<{ t0: number; marks: Record<string, number> } | null>(null);
  const resumeListeningRef = useRef<() => void>(() => undefined);
  /** The backchannels in the coach's voice (loaded when voice chat starts), taken in turn. */
  const backchannelsRef = useRef<{ voice: string; clips: SpeechChunkDTO[]; next: number } | null>(null);
  const coach = resolveCoach(preferences.design);
  const onVoiceIdle = useCallback(() => resumeListeningRef.current(), []);
  const onSpeechStart = useCallback(() => {
    const timing = timingRef.current;
    if (!timing) return;
    timingRef.current = null;
    timing.marks.heard = Math.round(performance.now() - timing.t0);
    if (LOG_VOICE_TIMING) console.info("[voice timing] ms after the member stopped talking", timing.marks);
  }, []);
  const video = useVideoCoach();
  const voice = useCoachVoice({
    pitch: coachVoice(coach.voice).pitch,
    gender: voiceGenderFor(coach.pronouns),
    onIdle: onVoiceIdle,
    onSpeechStart,
    video: video.sink,
  });
  const crisis = liveCrisis ?? highestCrisis(messages);

  const scrollToEnd = useCallback(() => {
    const list = listRef.current;
    if (list && messages.length) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  useEffect(scrollToEnd, [messages, status, scrollToEnd]);

  const send = useCallback(
    async (raw: string, options: SendOptions = {}): Promise<void> => {
      const text = raw.trim();
      if (!text) return;
      if (sendingRef.current) {
        // Spoke while the last reply was still finishing: send once it's done (several in a row are joined).
        if (options.handsFree || options.viaVoice) {
          const queued = queuedRef.current;
          queuedRef.current = queued ? { text: `${queued.text} ${text}`, options: queued.options } : { text, options };
        }
        return;
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        toast.error(`Keep messages under ${MAX_MESSAGE_LENGTH} characters.`);
        resumeListeningRef.current();
        return;
      }
      const viaVoice = Boolean(options.viaVoice || options.handsFree);
      // Heard replies: to voice messages, in hands-free chat, or when "Read replies aloud" is on.
      const speak = props.voiceEnabled && (viaVoice || preferences.autoSpeak);
      // ElevenLabs speaks on the server; otherwise the browser reads each sentence as it arrives.
      const chunker = speak && !props.serverVoice ? new SpeechChunker() : null;
      let spokenChunks = 0;
      // Only when they speak again soon after cutting the coach off; later it's a new topic.
      const cutOff = interruptedRef.current;
      interruptedRef.current = null;
      const interrupted = cutOff && Date.now() - cutOff.at < 2 * 60_000 ? cutOff.heard : null;
      liveReplyRef.current = PENDING;
      const abort = new AbortController();
      abortRef.current = abort;
      if (viaVoice) {
        const t0 = options.turn?.endedAt ?? performance.now();
        const marks: Record<string, number> = {};
        if (options.turn) marks.transcript = Math.round(options.turn.transcribedAt - t0);
        marks.sent = Math.round(performance.now() - t0);
        timingRef.current = { t0, marks };
      } else timingRef.current = null;
      const mark = (step: string) => {
        const timing = timingRef.current;
        if (timing) timing.marks[step] ??= Math.round(performance.now() - timing.t0);
      };
      if (speak) voice.begin(PENDING);
      else voice.stop();
      // Voice chat: a short "Mm-hm." in the coach's voice at once, while the reply is on its way.
      const backchannels = backchannelsRef.current;
      if (speak && options.handsFree && props.serverVoice && backchannels?.voice === coach.voice) {
        const clip = backchannels.clips[backchannels.next++ % backchannels.clips.length];
        if (clip) voice.enqueue(clip, { filler: true });
      }
      sendingRef.current = true;
      setSending(true);
      setStatus(null);
      setInput("");
      const now = new Date().toISOString();
      const tempUser: ChatMessageDTO = {
        id: `local-${now}`,
        role: "user",
        text,
        cards: null,
        feedback: null,
        outcome: null,
        createdAt: now,
      };
      const pending: ChatMessageDTO = {
        id: PENDING,
        role: "assistant",
        text: "",
        cards: null,
        feedback: null,
        outcome: null,
        createdAt: now,
      };
      setMessages((current) => [...current, tempUser, pending]);

      const patchPending = (patch: (message: ChatMessageDTO) => ChatMessageDTO) =>
        setMessages((current) => current.map((message) => (message.id === PENDING ? patch(message) : message)));
      const mergeCards = (cards: AiCards) =>
        patchPending((message) => ({ ...message, cards: { ...message.cards, ...cards } }));

      let finished = false;
      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId,
            text,
            near,
            viaVoice,
            handsFree: Boolean(options.handsFree),
            speak: speak && props.serverVoice,
            interrupted,
          }),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "The coach couldn't answer. Please try again.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          mark("firstByte");
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!line) continue;
            const event = JSON.parse(line) as AiStreamEvent;
            switch (event.type) {
              case "start":
                setMessages((current) =>
                  current.map((message) =>
                    message.id === tempUser.id ? { ...message, id: event.userMessageId } : message,
                  ),
                );
                if (!conversationId) {
                  setConversationId(event.conversationId);
                  setTitle(event.title);
                  if (!panel) window.history.replaceState(null, "", `${props.basePath}?c=${event.conversationId}`);
                }
                setConversations((current) => [
                  { id: event.conversationId, title: event.title, lastMessageAt: now, messageCount: 0 },
                  ...current.filter((conversation) => conversation.id !== event.conversationId),
                ]);
                break;
              case "text":
                mark("firstText");
                setStatus(null);
                patchPending((message) => ({ ...message, text: message.text + event.delta }));
                for (const chunk of chunker?.push(event.delta) ?? []) voice.enqueue({ text: speakableText(chunk) });
                break;
              case "speech":
                mark("firstAudioArrived");
                spokenChunks++;
                voice.enqueue(event);
                break;
              case "timing":
                if (LOG_VOICE_TIMING) console.info("[voice timing] server, ms after the request arrived", event.ms);
                break;
              case "spoken":
                // All the audio is here: hands-free can listen again once it has played, without waiting for `done`.
                // (With no audio at all, `done` has the browser read the reply instead.)
                if (spokenChunks > 0) voice.end();
                break;
              case "status":
                setStatus(event.label);
                break;
              case "cards":
                mergeCards(event.cards);
                break;
              case "safety":
                setLiveCrisis((current) => (current === "urgent" ? current : event.level));
                mergeCards({ crisis: { level: event.level, category: event.category } });
                break;
              case "done":
                finished = true;
                setMessages((current) => current.map((message) => (message.id === PENDING ? event.message : message)));
                if (speak) {
                  const rest = chunker?.flush();
                  if (rest) voice.enqueue({ text: speakableText(rest) });
                  // Server voice sent nothing (switched off midway?): the browser reads the reply.
                  if (!chunker && spokenChunks === 0) voice.enqueue({ text: speakableText(event.message.text) });
                  voice.rename(PENDING, event.message.id);
                }
                if (liveReplyRef.current === PENDING) liveReplyRef.current = event.message.id;
                break;
              case "error":
                throw new Error(event.message);
            }
          }
        }
        if (!finished)
          throw new Error(
            "The connection dropped. Your message was saved; open the conversation again to see the reply.",
          );
      } catch (error) {
        if (abort.signal.aborted) {
          // The member talked over the coach: keep what it had said so far (it's saved), marked as cut off.
          setMessages((current) =>
            current.flatMap((message) =>
              message.id !== PENDING
                ? [message]
                : message.text.trim()
                  ? [{ ...message, id: `interrupted-${now}`, text: `${message.text.trimEnd()} …` }]
                  : [],
            ),
          );
        } else {
          setMessages((current) => current.filter((message) => message.id !== PENDING));
          toast.error(error instanceof Error ? error.message : "The coach couldn't answer. Please try again.");
        }
      } finally {
        if (abortRef.current === abort) abortRef.current = null;
        sendingRef.current = false;
        setSending(false);
        setStatus(null);
        // Goes idle once the queued speech has played (or now, if there was none); hands-free then listens again.
        if (speak && !abort.signal.aborted) voice.end();
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued) void sendRef.current(queued.text, queued.options);
      }
    },
    [
      coach.voice,
      conversationId,
      near,
      panel,
      preferences.autoSpeak,
      props.basePath,
      props.serverVoice,
      props.voiceEnabled,
      voice,
    ],
  );
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  /**
   * The member cut the coach off (talked over it, tapped stop or the mic):
   * silence it at once, cancel the reply if it's still arriving (the server
   * saves what was said), and note what they heard for their next message.
   */
  const interruptReply = useCallback(() => {
    const heard = voice.heard();
    // Cutting off the latest reply (not a replay of an older one) is what the coach should hear about.
    const latest = voice.speakingId !== null && voice.speakingId === liveReplyRef.current;
    const speaking = voice.stop();
    const streaming = abortRef.current;
    if (streaming) {
      streaming.abort();
      abortRef.current = null;
    }
    if (streaming || (speaking && latest)) interruptedRef.current = { heard: heard ?? "", at: Date.now() };
    liveReplyRef.current = null;
  }, [voice]);

  const onVoiceText = useCallback((text: string) => void sendRef.current(text, { viaVoice: true }), []);
  const onVoiceError = useCallback((message: string) => toast.error(message), []);
  const mic = useVoiceInput({ serverTranscription: props.serverVoice, onText: onVoiceText, onError: onVoiceError });

  const onUtterance = useCallback(
    (text: string, turn?: { endedAt: number; transcribedAt: number }) =>
      void sendRef.current(text, { handsFree: true, turn }),
    [],
  );
  const onHandsFreeTimeout = useCallback(
    () => toast("Voice chat ended after a quiet spell. Tap the voice chat button to talk again."),
    [],
  );
  const handsFree = useHandsFree({
    serverTranscription: props.serverVoice,
    onUtterance,
    onBargeIn: interruptReply,
    onError: onVoiceError,
    onTimeout: onHandsFreeTimeout,
  });
  const { resume: resumeHandsFree, setCoachSpeaking } = handsFree;
  useEffect(() => {
    resumeListeningRef.current = resumeHandsFree;
  }, [resumeHandsFree]);
  useEffect(() => setCoachSpeaking(Boolean(voice.speakingId)), [setCoachSpeaking, voice.speakingId]);
  // Outside voice chat, talking over the coach stops it too (voice chat handles that itself). The mic
  // warms up as soon as a reply is on its way to be heard, so it's ready when the coach starts.
  useTalkOver({
    armed:
      props.voiceEnabled && !handsFree.active && mic.state === "idle" && Boolean(voice.loadingId || voice.speakingId),
    active: Boolean(voice.speakingId),
    onTalk: interruptReply,
  });

  /** Fetches the backchannels in the coach's current voice (once per voice; none if ElevenLabs is unavailable). */
  function loadBackchannels() {
    if (!props.serverVoice || backchannelsRef.current?.voice === coach.voice) return;
    const bank = { voice: coach.voice as string, clips: [] as SpeechChunkDTO[], next: 0 };
    backchannelsRef.current = bank;
    BACKCHANNELS.forEach((_, index) => {
      void fetch("/api/ai/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backchannel: index }),
      })
        .then((response) => (response.ok ? (response.json() as Promise<SpeechChunkDTO>) : null))
        .then((clip) => {
          if (clip?.audio) bank.clips.push(clip);
        })
        .catch(() => undefined);
    });
  }

  async function startHandsFree() {
    voice.unlock();
    loadBackchannels();
    setConnecting(true);
    const shown = Date.now();
    const on = await handsFree.start();
    // A short "Connecting…" moment even when the mic opens at once, so the call has a clear start.
    if (on) await new Promise((resolve) => setTimeout(resolve, Math.max(0, 800 - (Date.now() - shown))));
    setConnecting(false);
    setCallStartedAt(on ? Date.now() : null);
  }

  function endHandsFree() {
    handsFree.stop();
    interruptReply();
    interruptedRef.current = null;
    queuedRef.current = null;
    video.stop();
  }

  const inCall = connecting || handsFree.active;
  // The video face joins as the call starts and leaves when it ends (the call
  // can also end by itself when the mic times out). It pauses while the tab is
  // hidden, and after a failure the drawn coach stays for the rest of the call.
  const { status: videoStatus, failed: videoFailed, visible: pageVisible, start: startVideo, stop: stopVideo } = video;
  const wantVideo = props.videoAvailable && inCall;
  useEffect(() => {
    if (wantVideo && pageVisible && videoStatus === "off" && !videoFailed) void startVideo();
    else if (!wantVideo && (videoStatus !== "off" || videoFailed)) stopVideo();
  }, [wantVideo, pageVisible, videoStatus, videoFailed, startVideo, stopVideo]);
  const hfPhase = handsFree.phase;
  const avatarState: CoachState =
    mic.state === "recording" || hfPhase === "listening" || hfPhase === "hearing"
      ? "listening"
      : voice.speakingId
        ? "speaking"
        : sending || mic.state === "transcribing" || hfPhase === "transcribing"
          ? "thinking"
          : "idle";
  const statusLine =
    mic.state === "recording"
      ? "Listening… tap stop when you're done"
      : hfPhase === "listening"
        ? handsFree.muted
          ? "Microphone muted"
          : "Listening… just talk"
        : hfPhase === "hearing"
          ? "Hearing you…"
          : mic.state === "transcribing" || hfPhase === "transcribing"
            ? "Getting your words…"
            : voice.speakingId
              ? handsFree.active
                ? "Speaking… talk to interrupt"
                : "Speaking"
              : sending
                ? (status ?? "Thinking…")
                : "Here for you, any time";

  function shareLocation() {
    if (near) {
      setNear(null);
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device. Tell the coach your city or ZIP code instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        // Rounded to about 100 m: enough to sort places by distance.
        setNear(`${position.coords.latitude.toFixed(3)},${position.coords.longitude.toFixed(3)}`);
        toast.success("Location shared with the coach for this chat");
      },
      () => {
        setLocating(false);
        toast.error("We couldn't get your location. Tell the coach your city or ZIP code instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  async function rate(message: ChatMessageDTO, value: 1 | -1) {
    const next = message.feedback === value ? null : value;
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, feedback: next } : item)));
    const result = await feedbackAction({ messageId: message.id, value: next });
    if (result?.serverError) toast.error(result.serverError);
    else if (next === -1) toast("Thanks for telling us. It helps the study team improve the coach.");
  }

  const empty = messages.length === 0;
  const greeting = useMemo(
    () => `Hi${props.firstName ? ` ${props.firstName}` : ""}, I'm ${coach.name}.`,
    [coach.name, props.firstName],
  );

  function openPicker() {
    setPickerKey((key) => key + 1);
    setSheet("coach");
  }

  function newConversation() {
    if (props.onOpenConversation) props.onOpenConversation(null);
    else router.push(props.basePath);
  }

  const fullPageHref = conversationId ? `${props.basePath}?c=${conversationId}` : props.basePath;

  const headerButtons = (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-9 sm:size-10"
        aria-label="Your conversations"
        onClick={() => setSheet("history")}
      >
        <History aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-9 sm:size-10"
        aria-label="New conversation"
        onClick={newConversation}
        disabled={empty && !conversationId}
      >
        <Plus aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-9 sm:size-10"
        aria-label="Coach settings"
        onClick={() => setSheet("settings")}
      >
        <Settings2 aria-hidden />
      </Button>
    </div>
  );

  return (
    <div
      className={
        panel
          ? "flex h-full min-h-0 flex-col"
          : "mx-auto grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]"
      }
    >
      {/* Coach stage (desktop page) */}
      <aside className={panel ? "hidden" : "hidden lg:block"}>
        <div className="sticky top-20 flex flex-col items-center rounded-2xl border bg-card p-5 text-center shadow-soft">
          <CoachPortrait
            still={inCall}
            coach={coach}
            realistic={props.videoAvailable}
            state={avatarState}
            face={voice.face}
            listen={handsFree.listenLevel}
            size={176}
          />
          <h1 className="mt-3 text-xl font-semibold">{coach.name}</h1>
          <p className="text-sm text-muted-foreground">Your AI coach</p>
          <Button variant="ghost" size="sm" className="mt-1 h-8 rounded-full text-xs" onClick={openPicker}>
            <UserRound aria-hidden /> Choose your coach
          </Button>
          <p className="mt-2 min-h-5 text-sm font-medium text-brand-plum dark:text-brand-sky" aria-live="polite">
            {statusLine}
          </p>
          <div className="mt-3">{headerButtons}</div>
          <Button
            variant="outline"
            className="mt-4 h-10 w-full rounded-full border-destructive/30 text-destructive hover:bg-destructive/5"
            onClick={() => setSheet("help")}
          >
            <LifeBuoy aria-hidden /> Get help now
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            An AI coach, not a person or a doctor. It can make mistakes. In an emergency, call 911 or 988.
          </p>
        </div>
      </aside>

      {/* Conversation */}
      <section
        aria-label="Conversation with your AI coach"
        className={
          panel
            ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-card"
            : "flex h-[calc(100dvh-12.5rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-soft lg:h-[calc(100dvh-8.5rem)]"
        }
      >
        <header className="flex items-center gap-2 border-b px-2.5 py-2.5 sm:gap-3 sm:px-3 lg:px-4">
          <div className={compactOnly}>
            <CoachPortrait
              still={inCall}
              coach={coach}
              realistic={props.videoAvailable}
              state={avatarState}
              face={voice.face}
              listen={handsFree.listenLevel}
              size={panel ? 44 : 52}
              className="max-[359px]:size-10!"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-sans text-[0.95rem] font-semibold">
              <span className={compactOnly}>{coach.name}</span>
              {panel ? null : <span className="hidden lg:inline">{title ?? "New conversation"}</span>}
            </h2>
            <p className={cn("truncate text-xs text-muted-foreground", compactOnly)} aria-live="polite">
              {statusLine}
            </p>
          </div>
          {panel ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" className="size-9 sm:size-10" aria-label="Coach menu">
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem onSelect={() => setSheet("history")}>
                  <History aria-hidden /> Your conversations
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={newConversation} disabled={empty && !conversationId}>
                  <Plus aria-hidden /> New conversation
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openPicker}>
                  <UserRound aria-hidden /> Choose your coach
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSheet("settings")}>
                  <Settings2 aria-hidden /> Coach settings
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={fullPageHref} onClick={props.onClose}>
                    <Maximize2 aria-hidden /> Open full page
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="lg:hidden">{headerButtons}</div>
          )}
          <Button
            variant="ghost"
            size="icon-lg"
            className={cn("size-9 text-destructive sm:size-10", compactOnly)}
            aria-label="Get help now"
            onClick={() => setSheet("help")}
          >
            <LifeBuoy aria-hidden />
          </Button>
          {panel ? (
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-9 sm:size-10"
              aria-label="Minimize coach"
              onClick={props.onClose}
            >
              <ChevronDown aria-hidden className="sm:-rotate-90" />
            </Button>
          ) : null}
        </header>

        {!props.aiAvailable ? (
          <p className="border-b bg-warning/10 px-4 py-2 text-xs text-foreground">
            The coach is in limited mode right now: it can share approved Link Positively content and people to contact,
            but can&apos;t chat freely.
          </p>
        ) : null}

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-5"
          aria-live="polite"
          aria-busy={sending}
        >
          {empty && !handsFree.active ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center">
              <div className={compactOnly}>
                <CoachPortrait
                  still={inCall}
                  coach={coach}
                  realistic={props.videoAvailable}
                  state={avatarState}
                  face={voice.face}
                  listen={handsFree.listenLevel}
                  size={120}
                />
              </div>
              <p className="mt-3 text-lg font-semibold">{greeting}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask me about HIV, PrEP and PEP, testing, stress or wellness. I can find places near you and help you
                reach your peer navigator or the study team. Type, tap the mic, or start a voice chat and just talk.
              </p>
              <ul className={cn("mt-5 grid w-full gap-2", !panel && "sm:grid-cols-2")}>
                {STARTER_PROMPTS.map((prompt) => (
                  <li key={prompt}>
                    <button
                      type="button"
                      onClick={() => {
                        voice.unlock();
                        void send(prompt);
                      }}
                      disabled={sending}
                      className="min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-left text-sm transition-colors outline-none hover:border-primary/40 hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ol className="space-y-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <li key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[0.95rem] wrap-break-word whitespace-pre-wrap text-primary-foreground">
                    {message.text}
                  </p>
                </li>
              ) : (
                <li key={message.id} className="max-w-[92%] min-w-0 space-y-2.5">
                  {message.cards?.crisis ? <CrisisCard level={message.cards.crisis.level} /> : null}
                  <div className="rounded-2xl rounded-bl-md bg-muted/70 px-3.5 py-2.5 text-[0.95rem] leading-relaxed wrap-break-word">
                    {message.text ? (
                      <CoachMarkdown text={message.text} />
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner /> {status ?? "Thinking…"}
                      </span>
                    )}
                  </div>
                  <ReplyCards cards={message.cards} />
                  {message.id !== PENDING && !message.id.startsWith("interrupted-") && message.text ? (
                    <div className="flex items-center gap-0.5 text-muted-foreground">
                      {props.voiceEnabled ? (
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          className="size-9"
                          aria-label={voice.speakingId === message.id ? "Stop reading aloud" : "Read aloud"}
                          onClick={() => {
                            if (voice.speakingId === message.id) interruptReply();
                            else {
                              voice.unlock();
                              void voice.speak(message.id, message.text);
                            }
                          }}
                        >
                          {voice.loadingId === message.id ? (
                            <Spinner />
                          ) : voice.speakingId === message.id ? (
                            <Square aria-hidden />
                          ) : (
                            <Volume2 aria-hidden />
                          )}
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className={cn("size-9", message.feedback === 1 && "text-success")}
                        aria-label="Helpful"
                        aria-pressed={message.feedback === 1}
                        onClick={() => rate(message, 1)}
                      >
                        <ThumbsUp aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className={cn("size-9", message.feedback === -1 && "text-destructive")}
                        aria-label="Not helpful"
                        aria-pressed={message.feedback === -1}
                        onClick={() => rate(message, -1)}
                      >
                        <ThumbsDown aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ),
            )}
          </ol>
        </div>

        {crisis === "urgent" ? (
          <button
            type="button"
            onClick={() => setSheet("help")}
            className="flex items-center justify-center gap-2 border-t bg-destructive/10 px-4 py-2 text-center text-sm font-semibold text-destructive"
          >
            <LifeBuoy aria-hidden className="size-4 shrink-0" /> In danger? Call 911, or call or text 988
          </button>
        ) : null}

        <form
          className="border-t bg-background/60 p-2.5 lg:p-3"
          onSubmit={(event) => {
            event.preventDefault();
            voice.unlock();
            void send(input);
          }}
        >
          {near ? (
            <p className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-sky/15 px-2.5 py-1 text-xs font-medium">
              <LocateFixed aria-hidden className="size-3.5 shrink-0" /> Using your location for nearby places
              <button
                type="button"
                onClick={() => setNear(null)}
                className="rounded-full p-0.5 hover:bg-background"
                aria-label="Stop sharing location"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </p>
          ) : null}
          {voice.speakingId && !inCall ? (
            <div className="mb-2 flex justify-center">
              <Button
                type="button"
                variant="secondary"
                className="h-9 rounded-full px-4"
                onClick={interruptReply}
                aria-label={`Stop ${coach.name} talking`}
              >
                <Square aria-hidden /> Stop {coach.name} talking
              </Button>
            </div>
          ) : null}
          <div className="flex items-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={cn("size-11 shrink-0", near && "text-brand-plum dark:text-brand-sky")}
              aria-label={near ? "Stop sharing location" : "Share my location for nearby places"}
              aria-pressed={Boolean(near)}
              onClick={shareLocation}
              disabled={locating}
            >
              {locating ? <Spinner /> : <LocateFixed aria-hidden />}
            </Button>
            <label htmlFor="ai-input" className="sr-only">
              Message your coach
            </label>
            <AutoTextarea
              id="ai-input"
              minRows={1}
              value={input}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={mic.state === "recording" ? "Listening…" : "Ask anything…"}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  voice.unlock();
                  void send(input);
                }
              }}
              className="max-h-40 min-h-11 min-w-0 flex-1 rounded-2xl py-2.5 text-base sm:text-[0.95rem]"
              disabled={mic.state !== "idle"}
            />
            {props.voiceEnabled && mic.supported ? (
              <Button
                type="button"
                variant={mic.state === "recording" ? "destructive" : "ghost"}
                size="icon-lg"
                className={cn("size-11 shrink-0 rounded-full", mic.state === "recording" && "animate-pulse")}
                aria-label={mic.state === "recording" ? "Stop recording" : "Talk to your coach"}
                onClick={() => {
                  if (mic.state === "recording") return mic.stop();
                  voice.unlock();
                  interruptReply(); // the member is about to talk: the coach stops, mid-reply too
                  void mic.start();
                }}
                disabled={mic.state === "transcribing"}
              >
                {mic.state === "transcribing" ? (
                  <Spinner />
                ) : mic.state === "recording" ? (
                  <Square aria-hidden />
                ) : (
                  <Mic aria-hidden />
                )}
              </Button>
            ) : null}
            {props.voiceEnabled && handsFree.supported && !input.trim() ? (
              <Button
                type="button"
                variant="secondary"
                size="icon-lg"
                className="size-11 shrink-0 rounded-full"
                aria-label="Call your coach"
                title="Call: just talk, no buttons"
                onClick={() => void startHandsFree()}
                disabled={sending || mic.state !== "idle" || inCall}
              >
                <Phone aria-hidden />
              </Button>
            ) : null}
            <Button
              type="submit"
              size="icon-lg"
              className="size-11 shrink-0 rounded-full"
              aria-label="Send"
              disabled={sending || !input.trim()}
            >
              {sending ? <Spinner /> : <Send aria-hidden />}
            </Button>
          </div>
          <p className={cn("mt-1.5 px-1 text-[0.7rem] text-muted-foreground", compactOnly)}>
            AI coach, not a doctor. It can make mistakes. In an emergency, call 911 or 988.
          </p>
        </form>
      </section>

      {inCall ? (
        <CoachCall
          connecting={connecting}
          startedAt={callStartedAt}
          coach={coach}
          state={avatarState}
          statusLine={statusLine}
          caption={voice.caption}
          face={voice.face}
          listen={handsFree.listenLevel}
          muted={handsFree.muted}
          speaking={Boolean(voice.speakingId)}
          video={props.videoAvailable ? video : null}
          messages={messages}
          status={status}
          crisis={crisis}
          onMute={handsFree.setMuted}
          onStopTalking={() => {
            interruptReply();
            handsFree.resume();
          }}
          onEnd={endHandsFree}
          onHelp={() => setSheet("help")}
        />
      ) : null}

      <HistorySheet
        open={sheet === "history"}
        onOpenChange={(open) => setSheet(open ? "history" : null)}
        conversations={conversations}
        currentId={conversationId}
        basePath={props.basePath}
        timezone={props.timezone}
        onOpen={props.onOpenConversation}
      />
      <SettingsSheet
        open={sheet === "settings"}
        onOpenChange={(open) => setSheet(open ? "settings" : null)}
        preferences={preferences}
        onChange={setPreferences}
        onChooseCoach={openPicker}
        voiceEnabled={props.voiceEnabled}
        realistic={props.videoAvailable}
      />
      <CoachPicker
        key={pickerKey}
        open={sheet === "coach"}
        onOpenChange={(open) => setSheet(open ? "coach" : null)}
        design={preferences.design}
        onSaved={(design) => {
          setPreferences((current) => ({ ...current, design }));
          props.onCoachChange?.(design.coachId);
        }}
        voiceEnabled={props.voiceEnabled}
        realistic={props.videoAvailable}
        coachIds={props.coachIds}
      />
      <HelpSheet open={sheet === "help"} onOpenChange={(open) => setSheet(open ? "help" : null)} />
    </div>
  );
}
