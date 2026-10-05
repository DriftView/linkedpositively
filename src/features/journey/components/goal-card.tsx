"use client";

import Link from "next/link";
import { CalendarDays, EllipsisVertical, PartyPopper, Trash2, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { actionError } from "@/features/resources/client";
import { dismissGoalAction, updateGoalAction } from "../actions";
import { deadlineLabel } from "../lib";
import type { UserGoalDTO } from "../queries";
import { JOURNEY_STEPS } from "../steps";
import { StepTrack } from "./step-track";

/** One of the member's goals, with "Update progress". */
export function GoalCard({ goal }: { goal: UserGoalDTO }) {
  const [state, setState] = useState(goal);
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [, startTransition] = useTransition();
  const done = state.step === 7;
  const deadline = done ? null : deadlineLabel(state.targetDate);

  function remove() {
    setRemoved(true);
    startTransition(async () => {
      const result = await dismissGoalAction({ id: state.id, dismissed: true });
      const error = actionError(result);
      if (error) {
        setRemoved(false);
        toast.error(error);
        return;
      }
      toast("Goal removed from your journey", {
        action: {
          label: "Undo",
          onClick: () => {
            setRemoved(false);
            void dismissGoalAction({ id: state.id, dismissed: false });
          },
        },
      });
    });
  }

  return (
    <AnimatePresence>
      {!removed ? (
        <motion.article
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
          className={cn("relative overflow-hidden rounded-2xl border bg-card p-4 shadow-soft sm:p-5", done && "bg-gradient-to-br from-success/10 to-card")}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold tracking-wide text-brand-magenta uppercase">
                {state.categorySlug ? (
                  <Link href={`/journey/${state.categorySlug}`} className="hover:underline">
                    {state.categoryName}
                  </Link>
                ) : (
                  state.categoryName
                )}
              </p>
              <h3 className="mt-1 text-[1.05rem] leading-snug font-semibold">{state.title}</h3>
              {state.methodName ? <p className="mt-0.5 text-sm text-muted-foreground">I want to {lowerFirst(state.methodName)}</p> : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`More options for ${state.title}`} className="-mt-1 -mr-1 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <EllipsisVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setOpen(true)}>
                  <TrendingUp />
                  Update progress
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={remove}>
                  <Trash2 />
                  Remove goal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
              <span className={cn("font-semibold", done ? "text-success" : "text-primary")}>
                {done ? "Journey complete!" : `Step ${state.step}: ${JOURNEY_STEPS[state.step - 1]}`}
              </span>
              {deadline ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays aria-hidden className="size-3.5" />
                  {deadline}
                </span>
              ) : null}
            </div>
            <StepTrack step={state.step} />
          </div>

          {!done && (state.currentStepNote || state.nextStepNote) ? (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {state.currentStepNote ? (
                <div className="rounded-xl bg-muted/60 p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">Where I am</dt>
                  <dd className="mt-0.5">{state.currentStepNote}</dd>
                </div>
              ) : null}
              {state.nextStepNote ? (
                <div className="rounded-xl bg-secondary p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">My next step</dt>
                  <dd className="mt-0.5">{state.nextStepNote}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {!done ? (
            <Button variant="outline" onClick={() => setOpen(true)} className="mt-4 h-10 w-full rounded-full font-semibold sm:w-auto sm:px-5">
              <TrendingUp aria-hidden />
              Update progress
            </Button>
          ) : null}

          <AnimatePresence>{celebrate ? <Celebration onDone={() => setCelebrate(false)} /> : null}</AnimatePresence>

          <UpdateDialog
            goal={state}
            open={open}
            onOpenChange={setOpen}
            onSaved={(next, justCompleted) => {
              setState(next);
              if (justCompleted) setCelebrate(true);
            }}
          />
        </motion.article>
      ) : null}
    </AnimatePresence>
  );
}

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function Celebration({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => setTimeout(onDone, 2200)}
      className="absolute inset-0 grid place-items-center bg-card/90 backdrop-blur-sm"
      role="status"
    >
      <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-apricot/30 text-primary">
          <PartyPopper className="size-8" aria-hidden />
        </span>
        <p className="mt-3 font-heading text-xl font-semibold">Congratulations!</p>
        <p className="text-sm text-muted-foreground">You completed this goal.</p>
      </motion.div>
    </motion.div>
  );
}

function UpdateDialog({
  goal,
  open,
  onOpenChange,
  onSaved,
}: {
  goal: UserGoalDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (goal: UserGoalDTO, justCompleted: boolean) => void;
}) {
  const [step, setStep] = useState(goal.step);
  const [currentStepNote, setCurrent] = useState(goal.currentStepNote);
  const [nextStepNote, setNext] = useState(goal.nextStepNote);
  const [targetDate, setTargetDate] = useState(goal.targetDate ? goal.targetDate.slice(0, 10) : "");
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateGoalAction({ id: goal.id, step, currentStepNote, nextStepNote, targetDate: targetDate || null });
      const error = actionError(result);
      if (error || !result?.data) {
        toast.error(error ?? "Couldn't save your progress.");
        return;
      }
      onSaved(
        {
          ...goal,
          step,
          currentStepNote,
          nextStepNote,
          targetDate: targetDate ? `${targetDate}T12:00:00.000Z` : null,
          completedAt: step === 7 ? (goal.completedAt ?? new Date().toISOString()) : null,
        },
        result.data.justCompleted,
      );
      onOpenChange(false);
      if (!result.data.justCompleted) toast.success("Progress saved");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Update progress</DialogTitle>
            <DialogDescription className="line-clamp-2">{goal.title}</DialogDescription>
          </DialogHeader>
          <fieldset className="my-4">
            <legend className="mb-2 text-sm font-medium">Where are you now?</legend>
            <div className="grid gap-1.5">
              {JOURNEY_STEPS.map((label, index) => {
                const n = index + 1;
                const active = step === n;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStep(n)}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-xl border px-3 text-left text-sm transition-all",
                      active ? "border-primary bg-secondary font-semibold text-secondary-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                        n <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {n}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {step < 7 ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`current-${goal.id}`}>What have you done so far?</Label>
                <Textarea id={`current-${goal.id}`} value={currentStepNote} onChange={(event) => setCurrent(event.target.value)} maxLength={500} rows={2} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`next-${goal.id}`}>What&apos;s your next step?</Label>
                <Textarea id={`next-${goal.id}`} value={nextStepNote} onChange={(event) => setNext(event.target.value)} maxLength={500} rows={2} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`date-${goal.id}`}>Target date (optional)</Label>
                <Input id={`date-${goal.id}`} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="h-11 rounded-xl" />
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-success/10 p-3 text-sm">Amazing. Saving will mark this goal as complete.</p>
          )}
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" className="h-10 rounded-full px-4" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="h-10 rounded-full px-5">
              {pending ? <Spinner /> : null}
              Save progress
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
