"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  History,
  LifeBuoy,
  LocateFixed,
  Mic,
  MicOff,
  Palette,
  PhoneOff,
  Plus,
  Send,
  Settings2,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AutoTextarea } from "@/features/peer-nav/components/auto-textarea";
import { cn } from "@/lib/utils";
import { feedbackAction } from "../actions";
import { coachVoice, resolveCoach } from "../coach-design";
import { MAX_MESSAGE_LENGTH, STARTER_PROMPTS } from "../constants";
import { speakableText } from "../prompt";
import type { AiCards, AiPreferencesDTO, AiStreamEvent, ChatMessageDTO, ConversationSummaryDTO } from "../types";
import { SpeechChunker } from "../voice-lib";
import { CoachAvatar, type CoachState } from "./coach-avatar";
import { CoachDesigner } from "./coach-designer";
import { HelpSheet, HistorySheet, SettingsSheet } from "./coach-sheets";
import { CoachMarkdown, CrisisCard, ReplyCards } from "./reply-cards";
import { useCoachVoice } from "./use-coach-voice";
import { useHandsFree } from "./use-hands-free";
import { useVoiceInput } from "./use-voice-input";

type Props = {
  basePath: string;
  conversationId: string | null;
  title: string | null;
  initialMessages: ChatMessageDTO[];
  conversations: ConversationSummaryDTO[];
  preferences: AiPreferencesDTO;
  voiceEnabled: boolean;
  serverVoice: boolean;
  aiAvailable: boolean;
  timezone: string;
  firstName: string;
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

type SendOptions = { viaVoice?: boolean; handsFree?: boolean };

/**
 * The AI Coach conversation: the animated coach, the messages with their
 * cards, and a composer that takes text or voice. Replies stream in from
 * POST /api/ai/chat (NDJSON, see types.ts AiStreamEvent); when the reply is
 * to be heard, it is spoken sentence by sentence as it streams. Hands-free
 * voice chat turns the composer into call controls: the member just talks.
 */
export function AiCoach(props: Props) {
  const router = useRouter();
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
  const [sheet, setSheet] = useState<"history" | "settings" | "help" | "designer" | null>(null);
  const [designerKey, setDesignerKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const queuedRef = useRef<{ text: string; options: SendOptions } | null>(null);
  const resumeListeningRef = useRef<() => void>(() => undefined);
  const coach = resolveCoach(preferences.design);
  const onVoiceIdle = useCallback(() => resumeListeningRef.current(), []);
  const voice = useCoachVoice({ pitch: coachVoice(coach.voice).pitch, onIdle: onVoiceIdle });
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
        // Talked over the coach while its reply was still arriving: send once that turn is saved.
        if (options.handsFree) queuedRef.current = { text, options };
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
      if (speak) voice.begin(PENDING);
      else voice.stop();
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
          }),
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
                  window.history.replaceState(null, "", `${props.basePath}?c=${event.conversationId}`);
                }
                setConversations((current) => [
                  { id: event.conversationId, title: event.title, lastMessageAt: now, messageCount: 0 },
                  ...current.filter((conversation) => conversation.id !== event.conversationId),
                ]);
                break;
              case "text":
                setStatus(null);
                patchPending((message) => ({ ...message, text: message.text + event.delta }));
                for (const chunk of chunker?.push(event.delta) ?? []) voice.enqueue({ text: speakableText(chunk) });
                break;
              case "speech":
                spokenChunks++;
                voice.enqueue(event);
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
        setMessages((current) => current.filter((message) => message.id !== PENDING));
        toast.error(error instanceof Error ? error.message : "The coach couldn't answer. Please try again.");
      } finally {
        sendingRef.current = false;
        setSending(false);
        setStatus(null);
        // Goes idle once the queued speech has played (or now, if there was none); hands-free then listens again.
        if (speak) voice.end();
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued) void sendRef.current(queued.text, queued.options);
      }
    },
    [conversationId, near, preferences.autoSpeak, props.basePath, props.serverVoice, props.voiceEnabled, voice],
  );
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const onVoiceText = useCallback((text: string) => void sendRef.current(text, { viaVoice: true }), []);
  const onVoiceError = useCallback((message: string) => toast.error(message), []);
  const mic = useVoiceInput({ serverTranscription: props.serverVoice, onText: onVoiceText, onError: onVoiceError });

  const onUtterance = useCallback((text: string) => void sendRef.current(text, { handsFree: true }), []);
  const onHandsFreeTimeout = useCallback(
    () => toast("Voice chat ended after a quiet spell. Tap the voice chat button to talk again."),
    [],
  );
  const handsFree = useHandsFree({
    serverTranscription: props.serverVoice,
    onUtterance,
    onBargeIn: voice.stop,
    onError: onVoiceError,
    onTimeout: onHandsFreeTimeout,
  });
  const { resume: resumeHandsFree, setCoachSpeaking } = handsFree;
  useEffect(() => {
    resumeListeningRef.current = resumeHandsFree;
  }, [resumeHandsFree]);
  useEffect(() => setCoachSpeaking(Boolean(voice.speakingId)), [setCoachSpeaking, voice.speakingId]);

  function startHandsFree() {
    voice.unlock();
    void handsFree.start();
  }

  function endHandsFree() {
    handsFree.stop();
    voice.stop();
  }

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

  function openDesigner() {
    setDesignerKey((key) => key + 1);
    setSheet("designer");
  }

  const headerButtons = (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-10"
        aria-label="Your conversations"
        onClick={() => setSheet("history")}
      >
        <History aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-10"
        aria-label="New conversation"
        onClick={() => router.push(props.basePath)}
        disabled={empty && !conversationId}
      >
        <Plus aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-10"
        aria-label="Coach settings"
        onClick={() => setSheet("settings")}
      >
        <Settings2 aria-hidden />
      </Button>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Coach stage (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 flex flex-col items-center rounded-2xl border bg-card p-5 text-center shadow-soft">
          <CoachAvatar
            appearance={coach.appearance}
            name={coach.name}
            state={avatarState}
            face={voice.face}
            listen={handsFree.listenLevel}
            size={176}
          />
          <h1 className="mt-3 text-xl font-semibold">{coach.name}</h1>
          <p className="text-sm text-muted-foreground">Your AI coach</p>
          <Button variant="ghost" size="sm" className="mt-1 h-8 rounded-full text-xs" onClick={openDesigner}>
            <Palette aria-hidden /> Design your coach
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
        className="flex h-[calc(100dvh-12.5rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-soft lg:h-[calc(100dvh-8.5rem)]"
      >
        <header className="flex items-center gap-3 border-b px-3 py-2.5 lg:px-4">
          <div className="lg:hidden">
            <CoachAvatar
              appearance={coach.appearance}
              name={coach.name}
              state={avatarState}
              face={voice.face}
              listen={handsFree.listenLevel}
              size={52}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-sans text-[0.95rem] font-semibold">
              <span className="lg:hidden">{coach.name}</span>
              <span className="hidden lg:inline">{title ?? "New conversation"}</span>
            </h2>
            <p className="truncate text-xs text-muted-foreground lg:hidden" aria-live="polite">
              {statusLine}
            </p>
          </div>
          <div className="lg:hidden">{headerButtons}</div>
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-10 text-destructive lg:hidden"
            aria-label="Get help now"
            onClick={() => setSheet("help")}
          >
            <LifeBuoy aria-hidden />
          </Button>
        </header>

        {!props.aiAvailable ? (
          <p className="border-b bg-warning/10 px-4 py-2 text-xs text-foreground">
            The coach is in limited mode right now: it can share approved Link Positively content and people to contact,
            but can&apos;t chat freely.
          </p>
        ) : null}

        {handsFree.active ? (
          <div className="flex flex-col items-center gap-1.5 border-b bg-gradient-to-b from-secondary/70 to-card px-4 pt-3 pb-3 text-center">
            <div className="lg:hidden">
              <CoachAvatar
                appearance={coach.appearance}
                name={coach.name}
                state={avatarState}
                face={voice.face}
                listen={handsFree.listenLevel}
                size={148}
              />
            </div>
            <p className="text-sm font-medium text-brand-plum dark:text-brand-sky">{statusLine}</p>
            {/* Captions of what the coach is saying (the full reply is in the conversation below). */}
            <p aria-hidden className="line-clamp-3 min-h-10 max-w-md text-[0.95rem] leading-snug">
              {voice.caption}
            </p>
          </div>
        ) : null}

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-5"
          aria-live="polite"
          aria-busy={sending}
        >
          {empty && !handsFree.active ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center">
              <div className="lg:hidden">
                <CoachAvatar
                  appearance={coach.appearance}
                  name={coach.name}
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
              <ul className="mt-5 grid w-full gap-2 sm:grid-cols-2">
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
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[0.95rem] whitespace-pre-wrap text-primary-foreground">
                    {message.text}
                  </p>
                </li>
              ) : (
                <li key={message.id} className="max-w-[92%] space-y-2.5">
                  {message.cards?.crisis ? <CrisisCard level={message.cards.crisis.level} /> : null}
                  <div className="rounded-2xl rounded-bl-md bg-muted/70 px-3.5 py-2.5 text-[0.95rem] leading-relaxed">
                    {message.text ? (
                      <CoachMarkdown text={message.text} />
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner /> {status ?? "Thinking…"}
                      </span>
                    )}
                  </div>
                  <ReplyCards cards={message.cards} />
                  {message.id !== PENDING && message.text ? (
                    <div className="flex items-center gap-0.5 text-muted-foreground">
                      {props.voiceEnabled ? (
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          className="size-9"
                          aria-label={voice.speakingId === message.id ? "Stop reading aloud" : "Read aloud"}
                          onClick={() => {
                            if (voice.speakingId === message.id) voice.stop();
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
            className="flex items-center justify-center gap-2 border-t bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive"
          >
            <LifeBuoy aria-hidden className="size-4" /> In danger? Call 911, or call or text 988
          </button>
        ) : null}

        {handsFree.active ? (
          <div className="border-t bg-background/60 p-3">
            <div className="flex items-center justify-center gap-2.5">
              <Button
                type="button"
                variant={handsFree.muted ? "secondary" : "outline"}
                size="icon-lg"
                className="size-12 rounded-full"
                aria-pressed={handsFree.muted}
                aria-label={handsFree.muted ? "Unmute microphone" : "Mute microphone"}
                onClick={() => handsFree.setMuted(!handsFree.muted)}
              >
                {handsFree.muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
              </Button>
              {voice.speakingId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-full px-4"
                  onClick={() => {
                    voice.stop();
                    handsFree.resume();
                  }}
                >
                  <Square aria-hidden /> Stop talking
                </Button>
              ) : null}
              <Button type="button" variant="destructive" className="h-12 rounded-full px-5" onClick={endHandsFree}>
                <PhoneOff aria-hidden /> End voice chat
              </Button>
            </div>
            <p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
              Your mic is on. When you pause, your words are sent to the coach. AI coach, not a doctor. In an emergency,
              call 911 or 988.
            </p>
          </div>
        ) : (
          <form
            className="border-t bg-background/60 p-2.5 lg:p-3"
            onSubmit={(event) => {
              event.preventDefault();
              voice.unlock();
              void send(input);
            }}
          >
            {near ? (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-sky/15 px-2.5 py-1 text-xs font-medium">
                <LocateFixed aria-hidden className="size-3.5" /> Using your location for nearby places
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
                className="max-h-40 min-h-11 flex-1 rounded-2xl py-2.5 text-[0.95rem]"
                disabled={mic.state !== "idle"}
              />
              {props.voiceEnabled && mic.supported ? (
                <Button
                  type="button"
                  variant={mic.state === "recording" ? "destructive" : "ghost"}
                  size="icon-lg"
                  className={cn("size-11 shrink-0 rounded-full", mic.state === "recording" && "animate-pulse")}
                  aria-label={mic.state === "recording" ? "Stop recording" : "Talk to your coach"}
                  onClick={() => (mic.state === "recording" ? mic.stop() : void mic.start())}
                  disabled={sending || mic.state === "transcribing"}
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
                  aria-label="Start a voice chat"
                  title="Voice chat: just talk, no buttons"
                  onClick={startHandsFree}
                  disabled={sending || mic.state !== "idle"}
                >
                  <AudioLines aria-hidden />
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
            <p className="mt-1.5 px-1 text-[0.7rem] text-muted-foreground lg:hidden">
              AI coach, not a doctor. It can make mistakes. In an emergency, call 911 or 988.
            </p>
          </form>
        )}
      </section>

      <HistorySheet
        open={sheet === "history"}
        onOpenChange={(open) => setSheet(open ? "history" : null)}
        conversations={conversations}
        currentId={conversationId}
        basePath={props.basePath}
        timezone={props.timezone}
      />
      <SettingsSheet
        open={sheet === "settings"}
        onOpenChange={(open) => setSheet(open ? "settings" : null)}
        preferences={preferences}
        onChange={setPreferences}
        onDesign={openDesigner}
        voiceEnabled={props.voiceEnabled}
      />
      <CoachDesigner
        key={designerKey}
        open={sheet === "designer"}
        onOpenChange={(open) => setSheet(open ? "designer" : null)}
        design={preferences.design}
        onSaved={(design) => setPreferences((current) => ({ ...current, design }))}
        voiceEnabled={props.voiceEnabled}
      />
      <HelpSheet open={sheet === "help"} onOpenChange={(open) => setSheet(open ? "help" : null)} />
    </div>
  );
}
