"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TipCardData } from "../types";
import { TipCard } from "./tip-card";
import { useTipView } from "./use-tip-view";

/**
 * Swipeable tip cards (the old Swiper "dailytips" carousel), built on native
 * scroll-snap so touch swiping feels right on every phone. Arrow keys, the
 * prev/next buttons and the dots move between tips; the height follows the
 * active card. A tip counts as read after it has been in view for a moment.
 */
export function TipCarousel({ tips, label }: { tips: TipCardData[]; label: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const slides = useRef<(HTMLDivElement | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const count = tips.length + 1; // + the "all caught up" card

  const goTo = useCallback((next: number) => {
    const el = slides.current[Math.max(0, Math.min(next, slides.current.length - 1))];
    const box = scroller.current;
    if (!el || !box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left: el.offsetLeft - box.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Track the slide closest to the centre while scrolling.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const centre = box.scrollLeft + box.clientWidth / 2;
        let best = 0;
        let bestDistance = Infinity;
        slides.current.forEach((el, i) => {
          if (!el) return;
          const mid = el.offsetLeft - box.offsetLeft + el.clientWidth / 2;
          const distance = Math.abs(mid - centre);
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        });
        setIndex(best);
      });
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      box.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Follow the active slide's height (the old carousel's autoHeight).
  useLayoutEffect(() => {
    const el = slides.current[index];
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(count - 1);
    }
  }

  const atEnd = index >= count - 1;
  const position = Math.min(index + 1, tips.length);

  return (
    <section aria-roledescription="carousel" aria-label={label} className="relative">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {atEnd ? (
            <span>You&apos;re all caught up</span>
          ) : (
            <>
              Tip <span className="text-foreground tabular-nums">{position}</span> of <span className="tabular-nums">{tips.length}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous tip"
            className="inline-flex size-10 items-center justify-center rounded-full border bg-card text-foreground shadow-soft transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={atEnd}
            aria-label="Next tip"
            className="inline-flex size-10 items-center justify-center rounded-full border bg-card text-foreground shadow-soft transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`${label}. Use the arrow keys to move between tips.`}
        style={{ height }}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-1 transition-[height] duration-300 ease-out sm:mx-0 sm:gap-4 sm:px-0",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        )}
      >
        {tips.map((tip, i) => (
          <Slide
            key={tip.id}
            ref={(el) => {
              slides.current[i] = el;
            }}
            tip={tip}
            active={i === index}
            position={i + 1}
            total={tips.length}
          />
        ))}
        <div
          ref={(el) => {
            slides.current[tips.length] = el;
          }}
          role="group"
          aria-roledescription="slide"
          aria-label="All caught up"
          className="w-[88%] shrink-0 snap-center sm:w-full"
        >
          <CaughtUp />
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Choose a tip">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={i < tips.length ? `Tip ${i + 1}: ${tips[i].title}` : "All caught up"}
            onClick={() => goTo(i)}
            className="group/dot flex h-6 items-center px-0.5 focus-visible:outline-none"
          >
            <span
              className={cn(
                "block h-1.5 rounded-full transition-all duration-300 group-focus-visible/dot:ring-3 group-focus-visible/dot:ring-ring/50",
                i === index ? "w-6 bg-primary" : "w-1.5 bg-border group-hover/dot:bg-muted-foreground/50",
              )}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function Slide({
  tip,
  active,
  position,
  total,
  ref,
}: {
  tip: TipCardData;
  active: boolean;
  position: number;
  total: number;
  ref: React.Ref<HTMLDivElement>;
}) {
  useTipView(tip.id, { active, enabled: tip.canEarnPoints });
  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      aria-label={`${position} of ${total}`}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
      className={cn("w-[88%] shrink-0 snap-center transition-opacity duration-300 sm:w-full", !active && "opacity-60 sm:opacity-40")}
    >
      <TipCard tip={tip} />
    </div>
  );
}

function CaughtUp() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/40 px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <PartyPopper className="size-7" aria-hidden />
      </span>
      <h3 className="mt-4 text-lg font-semibold">You&apos;re all caught up</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">New tips arrive every day. Until then, dig into topics that matter to you.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/tips/explore"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85"
        >
          Explore tips <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/tips/favorites"
          className="inline-flex h-10 items-center rounded-full bg-secondary px-5 text-sm font-semibold text-secondary-foreground transition hover:bg-accent"
        >
          Your favourites
        </Link>
      </div>
    </div>
  );
}
