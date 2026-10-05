"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, CircleDashed, History, Minus, PartyPopper, Pencil, Pill, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { submitWeeklyCheckin } from "../actions";
import { formatCheckinDate as fmt, weekRange } from "../format";
import type { CheckinAnswer, CheckinDay, CheckinFeedback, CheckinPromptData } from "../types";

const STEPS = ["Your week", "Reflect", "Feedback"] as const;

type Props = {
  week: { week: number; start: string; end: string; closesAt: string };
  days: CheckinDay[];
  prompt: CheckinPromptData | null;
  answer: CheckinAnswer | null;
  answered: boolean;
  canAnswer: boolean;
  nextOpensAt: string | null;
};

/**
 * The weekly check-in: 1) your week at a glance from the daily check-ins,
 * marking days you used, 2) this week's two questions, 3) feedback.
 * Coming back after answering shows your feedback with an option to edit.
 */
export function CheckinFlow({ week, days, prompt, answer, answered, canAnswer, nextOpensAt }: Props) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<0 | 1 | 2>(answered ? 2 : 0);
  const [direction, setDirection] = useState(1);
  const [used, setUsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(days.filter((d) => d.used !== null).map((d) => [d.date, Boolean(d.used)])),
  );
  const [likert, setLikert] = useState<number | null>(answer?.likertValue ?? null);
  const [openAnswer, setOpenAnswer] = useState(answer?.openAnswer ?? "");
  const [feedback, setFeedback] = useState<CheckinFeedback | null>(answer?.feedback ?? null);
  const [points, setPoints] = useState(0);
  const [missingLikert, setMissingLikert] = useState(false);
  const [saving, startSaving] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  function go(next: 0 | 1 | 2) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    // Move focus to the new step's heading for screen readers and keyboards.
    window.setTimeout(() => document.getElementById(`checkin-step-${next}`)?.focus(), 50);
  }

  function save() {
    if (!likert) {
      setMissingLikert(true);
      document.getElementById("likert-group")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    startSaving(async () => {
      const result = await submitWeeklyCheckin({
        week: week.week,
        used: days.map((d) => ({ date: d.date, used: used[d.date] ?? false })),
        likertValue: likert,
        openAnswer,
      });
      if (result?.serverError || result?.validationErrors || !result?.data) {
        toast.error(result?.serverError ?? "Couldn't save your check-in. Please try again.");
        return;
      }
      setFeedback(result.data.feedback);
      setPoints(result.data.points);
      go(2);
    });
  }

  const medsYes = days.filter((d) => d.medsTaken === true).length;
  const logged = days.filter((d) => d.medsTaken !== null || d.mood).length;

  return (
    <div ref={topRef} className="scroll-mt-24">
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold">Week {week.week}</h2>
          <p className="text-sm text-muted-foreground">
            {weekRange(week.start, week.end)} · open until {fmt(week.closesAt, { weekday: "short", month: "short", day: "numeric" })}
          </p>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Check-in steps">
          {STEPS.map((label, i) => {
            const done = i < step || (i === 2 && step === 2);
            const current = i === step;
            return (
              <li key={label} aria-current={current ? "step" : undefined}>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={false}
                    animate={{ width: done || current ? "100%" : "0%" }}
                    transition={{ duration: reduce ? 0 : 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
                <span className={cn("mt-1.5 block text-xs font-medium", current ? "text-foreground" : "text-muted-foreground")}>
                  <span className="sr-only">Step {i + 1}: </span>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative mt-4">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {step === 0 ? (
              <section aria-labelledby="checkin-step-0" className="rounded-2xl border bg-card p-5 shadow-soft">
                <h3 id="checkin-step-0" tabIndex={-1} className="text-xl font-semibold outline-none">
                  Your week at a glance
                </h3>
                <p className="mt-1 text-[0.95rem] text-muted-foreground">
                  Here&apos;s what you logged in your daily check-ins. Tap <strong className="font-semibold text-foreground">Used</strong> on any day you
                  used street drugs or alcohol, then continue. Your answers are private.
                </p>

                <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                  {logged === 0 ? (
                    <>
                      You didn&apos;t log any daily check-ins this week — that&apos;s okay.{" "}
                      <Link href="/tracker" className="font-semibold underline underline-offset-4">
                        Try the tracker
                      </Link>{" "}
                      to see your week here next time.
                    </>
                  ) : (
                    <>
                      You took your meds on <strong className="font-semibold">{medsYes}</strong> of 7 days
                      {medsYes === 7 ? " — every single day. Amazing!" : "."}
                    </>
                  )}
                </p>

                <div className="mt-4" role="table" aria-label={`Week ${week.week}`}>
                  <div role="row" className="grid grid-cols-[1fr_4.5rem_3.5rem_5rem] items-center gap-2 px-2 pb-2 text-xs font-medium text-muted-foreground">
                    <span role="columnheader">Day</span>
                    <span role="columnheader" className="text-center">
                      Meds
                    </span>
                    <span role="columnheader" className="text-center">
                      Mood
                    </span>
                    <span role="columnheader" className="text-center">
                      Used?
                    </span>
                  </div>
                  <ul className="divide-y rounded-xl border">
                    {days.map((day) => {
                      const on = used[day.date] === true;
                      return (
                        <li key={day.date} role="row" className="grid grid-cols-[1fr_4.5rem_3.5rem_5rem] items-center gap-2 px-2 py-2.5">
                          <span role="rowheader" className="min-w-0 pl-1">
                            <span className="block text-sm font-medium">{day.weekday}</span>
                            <span className="block text-xs text-muted-foreground">{day.label}</span>
                          </span>
                          <span role="cell" className="flex justify-center">
                            <MedsBadge value={day.medsTaken} />
                          </span>
                          <span role="cell" className="flex justify-center">
                            {day.mood ? (
                              // eslint-disable-next-line @next/next/no-img-element -- small static SVG
                              <img src={day.mood.src} alt={day.mood.label} title={day.mood.label} className="size-9" />
                            ) : (
                              <span className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground" title="No mood logged">
                                <Minus className="size-4" aria-hidden />
                                <span className="sr-only">No mood logged</span>
                              </span>
                            )}
                          </span>
                          <span role="cell" className="flex justify-center">
                            <button
                              type="button"
                              aria-pressed={on}
                              disabled={!canAnswer}
                              aria-label={`${day.weekday}: ${on ? "used" : "didn't use"} street drugs or alcohol`}
                              onClick={() => setUsed((prev) => ({ ...prev, [day.date]: !on }))}
                              className={cn(
                                "inline-flex h-10 min-w-[4.5rem] items-center justify-center gap-1 rounded-full border px-3 text-xs font-semibold transition active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                                on ? "border-brand-magenta bg-brand-magenta text-white" : "border-border text-muted-foreground hover:border-brand-magenta/50 hover:text-foreground",
                              )}
                            >
                              {on ? <Check className="size-3.5" aria-hidden /> : null}
                              Used
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={() => go(1)} className={primaryButton}>
                    Continue <ArrowRight className="size-4" />
                  </button>
                </div>
              </section>
            ) : null}

            {step === 1 ? (
              <section aria-labelledby="checkin-step-1" className="rounded-2xl border bg-card p-5 shadow-soft">
                <h3 id="checkin-step-1" tabIndex={-1} className="sr-only outline-none">
                  Reflect on your week
                </h3>
                {prompt ? (
                  <>
                    <fieldset id="likert-group" aria-describedby={missingLikert ? "likert-error" : undefined}>
                      <legend className="font-heading text-xl leading-snug font-semibold text-balance">{prompt.likertText}</legend>
                      <div className="mt-4 space-y-2">
                        {prompt.options.map((option) => {
                          const checked = likert === option.value;
                          return (
                            <label
                              key={option.value}
                              className={cn(
                                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                                checked ? "border-primary bg-secondary" : "hover:border-primary/40 hover:bg-muted/50",
                              )}
                            >
                              <input
                                type="radio"
                                name="likert"
                                value={option.value}
                                checked={checked}
                                disabled={!canAnswer}
                                onChange={() => {
                                  setLikert(option.value);
                                  setMissingLikert(false);
                                }}
                                className="sr-only"
                              />
                              <span
                                aria-hidden
                                className={cn(
                                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                                  checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                                )}
                              >
                                {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                              </span>
                              <span className="text-[0.95rem] font-medium">{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {missingLikert ? (
                        <p id="likert-error" role="alert" className="mt-2 text-sm text-destructive">
                          Choose the answer that fits best.
                        </p>
                      ) : null}
                    </fieldset>

                    <div className="mt-7">
                      <label htmlFor="open-answer" className="font-heading text-lg leading-snug font-semibold text-balance">
                        {prompt.openText}
                      </label>
                      <textarea
                        id="open-answer"
                        value={openAnswer}
                        onChange={(e) => setOpenAnswer(e.target.value.slice(0, 2000))}
                        disabled={!canAnswer}
                        placeholder={prompt.openPlaceholder || "Write as much or as little as you like."}
                        rows={5}
                        className="mt-3 field-sizing-content min-h-32 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                      />
                      <p className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>Optional · only you and the study team can see this.</span>
                        <span className="tabular-nums">{openAnswer.length}/2000</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-[0.95rem] text-muted-foreground">This week&apos;s questions aren&apos;t ready yet. Please check back a little later.</p>
                )}

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => go(0)} className={ghostButton}>
                    <ArrowLeft className="size-4" /> Back
                  </button>
                  {prompt && canAnswer ? (
                    <button type="button" onClick={save} disabled={saving} className={primaryButton}>
                      {saving ? <Spinner /> : null}
                      {answered ? "Save changes" : "Finish check-in"}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section aria-labelledby="checkin-step-2" className="overflow-hidden rounded-2xl border bg-card shadow-soft">
                <div className="bg-gradient-to-br from-secondary via-card to-card px-5 pt-7 pb-5 text-center">
                  <motion.span
                    initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.05 }}
                    className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift"
                  >
                    <PartyPopper className="size-8" aria-hidden />
                  </motion.span>
                  <h3 id="checkin-step-2" tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
                    Thanks!
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your week {week.week} check-in is saved.
                  </p>
                  {points ? (
                    <motion.p
                      initial={reduce ? false : { y: 6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      className="mt-3 inline-flex rounded-full bg-brand-apricot/25 px-3 py-1 text-sm font-semibold dark:text-brand-apricot"
                    >
                      +{points} points
                    </motion.p>
                  ) : null}
                </div>
                <div className="space-y-4 px-5 pb-5">
                  {feedback?.long ? <div className="prose-content" dangerouslySetInnerHTML={{ __html: feedback.long }} /> : null}
                  {feedback?.short ? (
                    <div className="flex gap-3 rounded-xl bg-muted/60 p-4">
                      <Pill className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      <p className="text-[0.95rem]">{feedback.short}</p>
                    </div>
                  ) : null}
                  {nextOpensAt ? (
                    <p className="text-sm text-muted-foreground">
                      Your next check-in opens {fmt(nextOpensAt, { weekday: "long", month: "long", day: "numeric" })}.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href="/" className={primaryButton}>
                      Back to home
                    </Link>
                    <Link href="/check-in/history" className={ghostButton}>
                      <History className="size-4" /> Past check-ins
                    </Link>
                    {canAnswer ? (
                      <button type="button" onClick={() => go(0)} className={ghostButton}>
                        <Pencil className="size-4" /> Change answers
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function MedsBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success" title="Took meds">
        <Check className="size-4.5" strokeWidth={2.5} aria-hidden />
        <span className="sr-only">Took meds</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground" title="Missed">
        <X className="size-4.5" aria-hidden />
        <span className="sr-only">Missed meds</span>
      </span>
    );
  }
  return (
    <span className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground/70" title="No answer">
      <CircleDashed className="size-4" aria-hidden />
      <span className="sr-only">No answer</span>
    </span>
  );
}

const primaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/85 active:scale-[0.98] disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const ghostButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
