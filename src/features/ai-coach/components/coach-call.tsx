"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LifeBuoy, MessageSquareText, Mic, MicOff, PhoneOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AiCoachAppearance } from "@/server/db/schema/ai";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "../types";
import { CoachAvatar, type CoachFace, type CoachState } from "./coach-avatar";
import { CoachMarkdown, CrisisCard, ReplyCards } from "./reply-cards";
import "./coach-call.css";

type Props = {
  connecting: boolean;
  startedAt: number | null;
  coach: { name: string; appearance: AiCoachAppearance };
  state: CoachState;
  statusLine: string;
  caption: string | null;
  face: React.RefObject<CoachFace>;
  listen: React.RefObject<number>;
  muted: boolean;
  speaking: boolean;
  messages: ChatMessageDTO[];
  status: string | null;
  crisis: "elevated" | "urgent" | null;
  onMute: (muted: boolean) => void;
  onStopTalking: () => void;
  onEnd: () => void;
  onHelp: () => void;
};

/**
 * Hands-free voice chat as a phone call: a full-screen view with the coach in
 * the middle, rings that move with whoever is talking, a call timer, captions,
 * and big call buttons. The written conversation is one tap away. The screen
 * stays awake for the call (Wake Lock, where the browser has it).
 */
export function CoachCall(props: Props) {
  const { connecting, coach, messages } = props;
  const [transcript, setTranscript] = useState(false);
  const size = useAvatarSize(transcript);
  const endRef = useRef<HTMLButtonElement>(null);
  useWakeLock();

  useEffect(() => {
    endRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const last = messages.at(-1);
  const shared = Boolean(
    last?.role === "assistant" && (last.cards?.resources || last.cards?.sources || last.cards?.handoff),
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-call-title"
      className="fixed inset-0 z-[45] flex flex-col bg-background bg-gradient-to-b from-secondary via-background to-background text-foreground"
      onKeyDown={(event) => {
        if (event.key === "Escape" && transcript) setTranscript(false);
      }}
    >
      <header className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <h2 id="coach-call-title" className="truncate font-sans text-base font-semibold">
            Voice chat with {coach.name}
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {connecting || !props.startedAt ? "Connecting…" : <CallTimer startedAt={props.startedAt} />}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11 text-destructive"
          aria-label="Get help now"
          onClick={props.onHelp}
        >
          <LifeBuoy aria-hidden />
        </Button>
      </header>

      {props.crisis === "urgent" ? (
        <button
          type="button"
          onClick={props.onHelp}
          className="mx-auto mt-2 flex w-[calc(100%-2rem)] max-w-lg items-center justify-center gap-2 rounded-xl bg-destructive/10 px-4 py-2 text-center text-sm font-semibold text-destructive"
        >
          <LifeBuoy aria-hidden className="size-4 shrink-0" /> In danger? Call 911, or call or text 988
        </button>
      ) : null}

      <div
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col items-center px-4",
          transcript ? "pt-3" : "justify-center",
        )}
      >
        <CallRings state={connecting ? "connecting" : props.state} face={props.face} listen={props.listen}>
          <CoachAvatar
            appearance={coach.appearance}
            name={coach.name}
            state={props.state}
            face={props.face}
            listen={props.listen}
            size={size}
          />
        </CallRings>

        <p
          className="mt-5 min-h-6 text-center text-base font-medium text-brand-plum dark:text-brand-sky"
          aria-live="polite"
        >
          {connecting ? "Connecting…" : props.statusLine}
        </p>

        {transcript ? (
          <CallTranscript messages={messages} status={props.status} />
        ) : (
          <>
            {/* Captions of what the coach is saying (the reply is also in the transcript). */}
            <p aria-hidden className="mt-2 line-clamp-4 min-h-[5.5rem] max-w-md text-center text-lg leading-snug">
              {props.caption}
            </p>
            {shared ? (
              <Button variant="outline" className="mt-1 h-10 rounded-full" onClick={() => setTranscript(true)}>
                <MessageSquareText aria-hidden /> See what {coach.name} shared
              </Button>
            ) : null}
          </>
        )}
      </div>

      <footer className="mx-auto w-full max-w-lg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex min-h-10 justify-center">
          {props.speaking ? (
            <Button variant="secondary" className="h-10 rounded-full px-4" onClick={props.onStopTalking}>
              <Square aria-hidden /> Stop {coach.name} talking
            </Button>
          ) : null}
        </div>
        <div className="flex items-start justify-center gap-8">
          <CallButton
            label={props.muted ? "Unmute" : "Mute"}
            pressed={props.muted}
            onClick={() => props.onMute(!props.muted)}
            disabled={connecting}
          >
            {props.muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
          </CallButton>
          <CallButton ref={endRef} label="End" danger onClick={props.onEnd}>
            <PhoneOff aria-hidden />
          </CallButton>
          <CallButton
            label={transcript ? "Hide chat" : "Transcript"}
            pressed={transcript}
            onClick={() => setTranscript((open) => !open)}
          >
            <MessageSquareText aria-hidden />
          </CallButton>
        </div>
        <p className="mt-3 text-center text-[0.7rem] text-muted-foreground">
          Your mic is on. When you pause, your words go to the coach. AI coach, not a doctor. In an emergency, call 911
          or 988.
        </p>
      </footer>
    </div>,
    document.body,
  );
}

function CallButton({
  label,
  pressed,
  danger,
  children,
  ref,
  ...rest
}: {
  label: string;
  pressed?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        ref={ref}
        type="button"
        variant={danger ? "destructive" : pressed ? "default" : "secondary"}
        size="icon-lg"
        className="size-16 rounded-full shadow-soft [&_svg]:size-6!"
        aria-label={label}
        aria-pressed={danger ? undefined : pressed}
        {...rest}
      >
        {children}
      </Button>
      <span aria-hidden className="text-xs text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * Rings around the coach that swell with the voice of whoever is talking:
 * the coach's (plum) or the member's (sky). They ripple while connecting and
 * breathe while the coach thinks. Still for prefers-reduced-motion.
 */
function CallRings({
  state,
  face,
  listen,
  children,
}: {
  state: CoachState | "connecting";
  face: React.RefObject<CoachFace>;
  listen: React.RefObject<number>;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let level = 0;
    let frame = 0;
    const tick = () => {
      const current = stateRef.current;
      const target =
        current === "speaking" ? (face.current?.level ?? 0) : current === "listening" ? (listen.current ?? 0) : 0;
      // Quick to swell, slower to settle, so the rings don't flicker between syllables.
      level += (target - level) * (target > level ? 0.35 : 0.12);
      host.style.setProperty("--call-level", level.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [face, listen]);

  return (
    <div ref={hostRef} data-state={state} className="coach-call-rings relative grid place-items-center">
      {[0, 1, 2].map((ring) => (
        <span key={ring} aria-hidden className="coach-call-ring" style={{ "--ring": ring } as React.CSSProperties} />
      ))}
      <div className="relative">{children}</div>
    </div>
  );
}

function CallTranscript({ messages, status }: { messages: ChatMessageDTO[]; status: string | null }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight });
  }, [messages]);

  return (
    <div
      ref={listRef}
      className="mt-3 min-h-0 w-full flex-1 overflow-y-auto rounded-2xl border bg-card/80 p-3"
      aria-label="Transcript"
    >
      {messages.length ? (
        <ol className="space-y-3">
          {messages.map((message) =>
            message.role === "user" ? (
              <li key={message.id} className="flex justify-end">
                <p className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-sm wrap-break-word whitespace-pre-wrap text-primary-foreground">
                  {message.text}
                </p>
              </li>
            ) : (
              <li key={message.id} className="max-w-[92%] min-w-0 space-y-2">
                {message.cards?.crisis ? <CrisisCard level={message.cards.crisis.level} /> : null}
                <div className="rounded-2xl rounded-bl-md bg-muted/70 px-3 py-2 text-sm leading-relaxed wrap-break-word">
                  {message.text ? (
                    <CoachMarkdown text={message.text} />
                  ) : (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Spinner /> {status ?? "Thinking…"}
                    </span>
                  )}
                </div>
                <ReplyCards cards={message.cards} />
              </li>
            ),
          )}
        </ol>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">What you and your coach say will show here.</p>
      )}
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return <>{h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`}</>;
}

/** The coach's size: as large as the screen allows, smaller with the transcript open. */
function useAvatarSize(compact: boolean) {
  const [size, setSize] = useState(220);
  useEffect(() => {
    const measure = () =>
      setSize(
        compact ? 112 : Math.round(Math.max(140, Math.min(300, window.innerWidth * 0.62, window.innerHeight * 0.34))),
      );
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [compact]);
  return size;
}

/** Keeps the screen on while mounted (the lock drops when the tab is hidden, so it is taken again on return). */
function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release().catch(() => undefined);
        else lock = next;
      } catch {
        // Not allowed here (battery saver, iframe): the call works without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
