"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { AiCoachId } from "@/server/db/schema/ai";
import { findCoach } from "../coach-design";
import type { AiCoachData } from "../types";
import { AiCoach } from "./ai-coach";
import { CoachPortrait } from "./coach-portrait";

type Props = {
  /** The AI Coach page of this program; the floating coach steps aside there. */
  basePath: string;
  coachId: AiCoachId;
  realistic: boolean;
};

/** Phones and small tablets: the panel fills the screen and the bubble sits above the tab bar. */
const SMALL_SCREEN = "(max-width: 639px)";

/**
 * The floating coach: a bubble with the coach's face on every page that opens
 * the coach in a panel (full screen on phones, docked on the right on larger
 * screens). It lives in the layout, so the conversation stays as the member
 * moves between pages. Its data loads on first open (GET /api/ai/coach).
 */
export function CoachLauncher({ basePath, coachId: initialCoachId, realistic }: Props) {
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

  return (
    <>
      <button
        ref={bubbleRef}
        type="button"
        onClick={() => void openPanel()}
        aria-label={`Talk to ${coach.name}, your AI coach`}
        aria-expanded={open}
        aria-controls={panelId}
        title={`Talk to ${coach.name}`}
        disabled={loading}
        className={cn(
          "fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[41] rounded-full bg-background p-1 shadow-lg ring-1 ring-border transition-[transform,opacity] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none lg:right-6 lg:bottom-6",
          open && "pointer-events-none scale-90 opacity-0",
          (tucked || typing) && "max-lg:pointer-events-none max-lg:translate-y-28 max-lg:opacity-0",
        )}
      >
        <CoachPortrait coach={coach} realistic={realistic} state="idle" size={52} still className="size-13" />
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
