"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MessageCircle, Volume2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AiCoachId } from "@/server/db/schema/ai";
import { findCoach } from "../coach-design";
import type { AiCoachData } from "../types";
import { AiCoach } from "./ai-coach";
import { CoachPortrait } from "./coach-portrait";
import { NO_GREETING_GESTURE, useCoachGreeting } from "./use-coach-greeting";

type Props = {
  /** The AI Coach page of this program; the floating coach steps aside there. */
  basePath: string;
  coachId: AiCoachId;
  realistic: boolean;
  /** For the greeting's text (only when the member lets the coach personalize). */
  firstName: string | null;
  /** The coach may speak (admin Voice setting), and with ElevenLabs. */
  voiceEnabled: boolean;
  serverVoice: boolean;
  /** Staff viewing as the member: no greeting. */
  impersonating: boolean;
};

/** Phones and small tablets: the panel fills the screen and the bubble sits above the tab bar. */
const SMALL_SCREEN = "(max-width: 639px)";

/**
 * The floating coach: a bubble with the coach's face on every page that opens
 * the coach in a panel (full screen on phones, docked on the right on larger
 * screens). It lives in the layout, so the conversation stays as the member
 * moves between pages. Its data loads on first open (GET /api/ai/coach).
 * When the member opens the app it says hello (use-coach-greeting.ts): a
 * speech bubble and a soft pulse, and the coach's voice on their first tap.
 */
export function CoachLauncher({
  basePath,
  coachId: initialCoachId,
  realistic,
  firstName,
  voiceEnabled,
  serverVoice,
  impersonating,
}: Props) {
  const pathname = usePathname();
  const onCoachPage = pathname === basePath || pathname.startsWith(`${basePath}/`);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AiCoachData | null>(null);
  const [instance, setInstance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [coachId, setCoachId] = useState(initialCoachId);
  const [tucked, setTucked] = useState(false);
  const [typing, setTyping] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const coach = findCoach(coachId);
  const reduceMotion = useReducedMotion();
  const [holdGreeting, setHoldGreeting] = useState(false);
  const greet = useCoachGreeting({
    coach,
    firstName,
    voiceEnabled,
    serverVoice,
    impersonating,
    blocked: open || onCoachPage,
    paused: holdGreeting,
  });
  const greeting = greet.greeting;

  // The AI Coach page has the full coach: close the panel there, and load afresh
  // afterwards so the panel shows what was said on the page.
  const [wasOnCoachPage, setWasOnCoachPage] = useState(onCoachPage);
  if (onCoachPage !== wasOnCoachPage) {
    setWasOnCoachPage(onCoachPage);
    if (onCoachPage) {
      setOpen(false);
      setData(null);
    }
  }

  const load = useCallback(async (conversation?: string | null) => {
    setLoading(true);
    try {
      const query = conversation === undefined ? "" : `?c=${encodeURIComponent(conversation ?? "new")}`;
      const response = await fetch(`/api/ai/coach${query}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as AiCoachData & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The coach couldn't open. Please try again.");
      setData(body);
      setCoachId(body.preferences.design.coachId);
      setInstance((current) => current + 1);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The coach couldn't open. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  async function openPanel() {
    if (data) {
      setOpen(true);
      return;
    }
    if (await load()) setOpen(true);
  }

  const close = useCallback(() => {
    setOpen(false);
    bubbleRef.current?.focus();
  }, []);

  // Opening: move focus into the panel. Phones: the page behind doesn't scroll,
  // and the panel follows the visible viewport so the composer stays above the keyboard.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.focus();
    const small = window.matchMedia(SMALL_SCREEN).matches;
    if (!small) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const fit = () => {
      if (!panel || !viewport) return;
      panel.style.height = `${viewport.height}px`;
      panel.style.top = `${viewport.offsetTop}px`;
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    return () => {
      document.body.style.overflow = overflow;
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      if (panel) {
        panel.style.height = "";
        panel.style.top = "";
      }
    };
  }, [open]);

  // Phones: the bubble tucks away while scrolling down and while typing elsewhere, so it never covers content.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      setTucked(y > lastY && y > 80);
      lastY = y;
    };
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || target.matches("input:not([type=checkbox]):not([type=radio]), textarea, select"));
    const onFocusIn = (event: FocusEvent) =>
      setTyping(isField(event.target) && !panelRef.current?.contains(event.target as Node));
    const onFocusOut = () => setTyping(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  if (onCoachPage) return null;
  // Tucked away: also out of the tab order (invisible), so keyboard focus never lands on hidden controls.
  const hidden =
    (tucked || typing) && "max-lg:pointer-events-none max-lg:invisible max-lg:translate-y-28 max-lg:opacity-0";

  return (
    <>
      {/* Always in the page, so screen readers announce the greeting when its text arrives. */}
      <p role="status" aria-live="polite" className="sr-only">
        {greeting?.text ?? ""}
      </p>
      {greeting ? (
        <motion.div
          onPointerEnter={() => setHoldGreeting(true)}
          onPointerLeave={() => setHoldGreeting(false)}
          onFocus={() => setHoldGreeting(true)}
          onBlur={() => setHoldGreeting(false)}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.94 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          style={{ transformOrigin: "bottom right" }}
          className={cn(
            "fixed right-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-[41] w-[min(19rem,calc(100vw-2rem))] rounded-2xl rounded-br-md bg-card p-3.5 pr-9 shadow-xl ring-1 ring-border transition-[transform,opacity,visibility] duration-200 lg:right-6 lg:bottom-[5.75rem]",
            hidden,
          )}
        >
          <button
            type="button"
            {...{ [NO_GREETING_GESTURE]: "" }}
            onClick={greet.dismiss}
            aria-label="Close the greeting"
            className="absolute top-2 right-2 rounded-full p-1 text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X aria-hidden className="size-4" />
          </button>
          <p aria-hidden className="text-sm leading-relaxed">
            {greeting.text}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 rounded-full"
              {...{ [NO_GREETING_GESTURE]: "" }}
              onClick={() => void openPanel()}
            >
              <MessageCircle aria-hidden /> Talk to {coach.name}
            </Button>
            {voiceEnabled && !greet.played ? (
              <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={greet.play}>
                <Volume2 aria-hidden /> Hear {coach.name}
              </Button>
            ) : null}
          </div>
        </motion.div>
      ) : null}

      <button
        ref={bubbleRef}
        type="button"
        {...{ [NO_GREETING_GESTURE]: "" }}
        onClick={() => void openPanel()}
        aria-label={`Talk to ${coach.name}, your AI coach`}
        aria-expanded={open}
        aria-controls={panelId}
        title={`Talk to ${coach.name}`}
        disabled={loading}
        className={cn(
          "fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[41] rounded-full bg-background p-1 shadow-lg ring-1 ring-border transition-[transform,opacity,visibility] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none lg:right-6 lg:bottom-6",
          open && "pointer-events-none scale-90 opacity-0",
          hidden,
        )}
      >
        {greeting ? (
          // A soft pulse while the coach says hello.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-4 ring-brand-sky/50 [animation-duration:1.8s] motion-reduce:hidden"
          />
        ) : null}
        <CoachPortrait
          coach={coach}
          realistic={realistic}
          state={greet.speaking ? "speaking" : "idle"}
          face={greet.face}
          size={52}
          still={!greet.speaking}
          className="size-13"
        />
        <span
          aria-hidden
          className="absolute right-0.5 bottom-0.5 size-3.5 rounded-full bg-success ring-2 ring-background"
        />
        {loading ? (
          <span className="absolute inset-1 flex items-center justify-center rounded-full bg-background/70">
            <Spinner />
          </span>
        ) : null}
      </button>

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label={`Chat with ${coach.name}, your AI coach`}
        tabIndex={-1}
        onKeyDown={(event) => {
          // Esc minimizes, unless it came from a sheet or menu the coach opened (they close themselves).
          if (event.key === "Escape" && panelRef.current?.contains(event.target as Node)) {
            event.preventDefault();
            close();
          }
        }}
        className={cn(
          "fixed inset-x-0 top-0 z-[42] flex h-dvh flex-col overflow-hidden bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none",
          "sm:inset-auto sm:top-[4.5rem] sm:right-4 sm:bottom-4 sm:h-auto sm:w-[26rem] sm:rounded-2xl sm:border sm:p-0 sm:shadow-2xl lg:right-6 lg:bottom-6",
          !open && "hidden",
        )}
      >
        {data ? (
          <AiCoach
            key={instance}
            variant="panel"
            basePath={basePath}
            {...data}
            onClose={close}
            onOpenConversation={(id) => void load(id)}
            onCoachChange={setCoachId}
          />
        ) : null}
      </div>
    </>
  );
}
