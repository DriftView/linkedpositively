"use client";

import { Check, PenLine, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { actionError, fieldErrors } from "@/features/resources/client";
import { startGoalAction } from "../actions";
import { DEADLINES, isoDateFromNow } from "../lib";

type Props =
  | { kind: "catalog"; goalId: string; goalName: string; active: boolean }
  | { kind: "own"; categories: string[] };

/** "Start this goal" (catalog) or "Write your own goal". */
export function StartGoal(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(props.kind === "catalog" && props.active);
  const [deadline, setDeadline] = useState<number | null>(14);
  const [ownGoal, setOwnGoal] = useState("");
  const [ownCategory, setOwnCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const goalIn = deadline ? (DEADLINES.find((item) => item.days === deadline)?.label ?? "") : "";
    const targetDate = deadline ? isoDateFromNow(deadline) : undefined;
    startTransition(async () => {
      const result =
        props.kind === "catalog"
          ? await startGoalAction({ kind: "catalog", goalId: props.goalId, goalIn, targetDate })
          : await startGoalAction({ kind: "own", ownGoal, ownCategory, goalIn, targetDate });
      const fields = fieldErrors(result);
      const message = actionError(result);
      if (message) {
        if (fields.ownGoal) setError(fields.ownGoal);
        else toast.error(message);
        return;
      }
      setOpen(false);
      setStarted(true);
      setOwnGoal("");
      toast.success("Added to your journey", {
        description: "Update your progress any time.",
        action: { label: "See my goals", onClick: () => router.push("/journey") },
      });
    });
  }

  const trigger =
    props.kind === "catalog" ? (
      started ? (
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-3 text-sm font-semibold text-success">
          <Check aria-hidden className="size-4" />
          In your journey
        </span>
      ) : (
        <DialogTrigger asChild>
          <Button variant="outline" className="h-9 shrink-0 rounded-full px-3.5 font-semibold" aria-label={`Start goal: ${props.goalName}`}>
            <Plus aria-hidden />
            Start
          </Button>
        </DialogTrigger>
      )
    ) : (
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 rounded-full px-5 font-semibold">
          <PenLine aria-hidden />
          Write your own goal
        </Button>
      </DialogTrigger>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{props.kind === "catalog" ? "Start this goal" : "Your own goal"}</DialogTitle>
            <DialogDescription>
              {props.kind === "catalog" ? props.goalName : "Anything that matters to you. Only you can see your goals."}
            </DialogDescription>
          </DialogHeader>

          {props.kind === "own" ? (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="own-goal">My goal</Label>
                <Input
                  id="own-goal"
                  value={ownGoal}
                  onChange={(event) => setOwnGoal(event.target.value)}
                  maxLength={300}
                  placeholder="e.g. Cook at home three nights a week"
                  className="h-11 rounded-xl"
                  aria-invalid={Boolean(error)}
                  autoFocus
                />
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="own-category">Area of life (optional)</Label>
                <Input
                  id="own-category"
                  value={ownCategory}
                  onChange={(event) => setOwnCategory(event.target.value)}
                  maxLength={120}
                  list="journey-areas"
                  placeholder="Health, Friends…"
                  className="h-11 rounded-xl"
                />
                <datalist id="journey-areas">
                  {props.categories.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>
          ) : null}

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">I&apos;d like to get there in</legend>
            <div className="flex flex-wrap gap-2">
              {[...DEADLINES.map((item) => ({ label: item.label, days: item.days as number | null })), { label: "No deadline", days: null }].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={deadline === option.days}
                  onClick={() => setDeadline(option.days)}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm font-medium transition-all",
                    deadline === option.days ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" className="h-10 rounded-full px-4" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || (props.kind === "own" && !ownGoal.trim())} className="h-10 rounded-full px-5">
              {pending ? <Spinner /> : null}
              Add to my journey
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
