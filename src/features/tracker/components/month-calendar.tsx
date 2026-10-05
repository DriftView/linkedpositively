"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monthGrid, monthOf, monthTitle, shiftDay, shiftMonth } from "../calendar-math";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type DayState = { isToday: boolean; isFuture: boolean; isSelected: boolean };

/**
 * Month grid shared by the check-in and personal tracker calendars.
 * - Prev/next buttons, swipe left/right, PageUp/PageDown change the month.
 * - Arrow keys move between days (crossing into the next/previous month).
 * - Selecting a day reports it through `onSelect` (details render outside).
 */
export function MonthCalendar({
  today,
  minMonth,
  selected,
  onSelect,
  renderDay,
  dayLabel,
  dayClassName,
  summary,
  toolbar,
  month,
  onMonthChange,
}: {
  today: string;
  minMonth: string;
  selected: string;
  onSelect: (day: string) => void;
  renderDay: (day: string, state: DayState) => React.ReactNode;
  dayLabel: (day: string) => string;
  dayClassName?: (day: string, state: DayState) => string | undefined;
  summary?: (month: string) => React.ReactNode;
  toolbar?: React.ReactNode;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const maxMonth = monthOf(today);
  const [direction, setDirection] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const canPrev = month > minMonth;
  const canNext = month < maxMonth;

  function goMonth(delta: number) {
    const next = shiftMonth(month, delta);
    if (next < minMonth || next > maxMonth) return;
    setDirection(delta);
    onMonthChange(next);
    // Keep the selection inside the visible month.
    const day = `${next}-${selected.slice(8, 10)}`;
    const valid = parseISO(day).getMonth() === parseISO(`${next}-01`).getMonth() ? day : `${next}-01`;
    onSelect(valid > today ? today : valid);
  }

  function moveSelection(delta: number) {
    const next = shiftDay(selected, delta);
    if (next > today || monthOf(next) < minMonth) return;
    focusAfterRender.current = true;
    if (monthOf(next) !== month) {
      setDirection(next > selected ? 1 : -1);
      onMonthChange(monthOf(next));
    }
    onSelect(next);
  }

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)?.focus();
  }, [selected, month]);

  function onKeyDown(event: React.KeyboardEvent) {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => moveSelection(-1),
      ArrowRight: () => moveSelection(1),
      ArrowUp: () => moveSelection(-7),
      ArrowDown: () => moveSelection(7),
      PageUp: () => {
        focusAfterRender.current = true;
        goMonth(-1);
      },
      PageDown: () => {
        focusAfterRender.current = true;
        goMonth(1);
      },
    };
    const handler = keys[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  const weeks = monthGrid(month);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold" aria-live="polite">
            {monthTitle(month)}
          </h3>
          {summary ? <div className="text-sm text-muted-foreground">{summary(month)}</div> : null}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-full"
          onClick={() => goMonth(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-full"
          onClick={() => goMonth(1)}
          disabled={!canNext}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
      </div>

      {toolbar ? <div className="mt-4">{toolbar}</div> : null}

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold tracking-wide text-muted-foreground" aria-hidden>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={index}>{initial}</span>
        ))}
      </div>

      <div
        className="relative -mx-1.5 mt-0 touch-pan-y overflow-hidden px-1.5 pt-1.5 pb-1.5"
        onPointerDown={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointer.current;
          pointer.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) goMonth(dx < 0 ? 1 : -1);
        }}
      >
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={month}
            ref={gridRef}
            role="grid"
            aria-label={monthTitle(month)}
            onKeyDown={onKeyDown}
            custom={direction}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 40 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="space-y-1"
          >
            {weeks.map((week, row) => (
              <div key={row} role="row" className="grid grid-cols-7 gap-1">
                {week.map((day, column) => {
                  if (!day) return <div key={column} role="gridcell" aria-hidden />;
                  const state: DayState = { isToday: day === today, isFuture: day > today, isSelected: day === selected };
                  return (
                    <div key={day} role="gridcell" aria-selected={state.isSelected}>
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={state.isSelected ? 0 : -1}
                        disabled={state.isFuture}
                        aria-label={`${WEEKDAY_NAMES[column]}, ${format(parseISO(day), "MMMM d")}: ${dayLabel(day)}`}
                        aria-current={state.isToday ? "date" : undefined}
                        onClick={() => onSelect(day)}
                        className={cn(
                          "relative flex aspect-square w-full flex-col sm:aspect-[6/5] items-center justify-center rounded-xl text-sm transition-[background-color,box-shadow,transform] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 disabled:cursor-default disabled:opacity-35",
                          dayClassName?.(day, state),
                          state.isSelected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card",
                        )}
                      >
                        {renderDay(day, state)}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Day number chip used inside cells. */
export function DayNumber({ day, state, className }: { day: string; state: DayState; className?: string }) {
  return (
    <span
      className={cn(
        "text-[0.8rem] leading-none tabular-nums",
        state.isToday ? "font-bold text-primary" : "font-medium",
        className,
      )}
    >
      {Number(day.slice(8, 10))}
    </span>
  );
}
