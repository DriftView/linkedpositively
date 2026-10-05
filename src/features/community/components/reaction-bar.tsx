"use client";

/**
 * <ReactionBar summary={ReactionSummary} size?="sm" | "md" className? />
 *
 * The five wall reactions (haha, love, thumbs up, 100, proud) for any item:
 * posts, comments, tips, resources. Build `summary` on the server with
 * `getReactionSummary({ type, id, authorId? }, viewer)` from
 * `@/features/community/queries`. One reaction per person per item; people
 * can't react to their own content (the chips then open "who reacted").
 * Updates optimistically and rolls back on failure.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SmilePlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { loadReactors, react } from "../actions";
import { profileHref } from "../links";
import { REACTION_KINDS, REACTION_META, type ReactionKind, type ReactionSummary, type Reactor } from "../types";

export type { ReactionSummary };

function applyReaction(summary: ReactionSummary, kind: ReactionKind | null): ReactionSummary {
  const counts = { ...summary.counts };
  if (summary.mine) counts[summary.mine] = Math.max(0, counts[summary.mine] - 1);
  if (kind) counts[kind] += 1;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { ...summary, counts, total, mine: kind };
}

export function ReactionIcon({ kind, className }: { kind: ReactionKind; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs
  return <img src={REACTION_META[kind].icon} alt="" aria-hidden className={cn("size-[1.15rem] select-none dark:brightness-[1.6] dark:saturate-[1.1]", className)} draggable={false} />;
}

export function ReactionBar({
  summary: initial,
  size = "md",
  className,
}: {
  summary: ReactionSummary;
  size?: "sm" | "md";
  className?: string;
}) {
  const [summary, setSummary] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [pulse, setPulse] = useState<ReactionKind | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(kind: ReactionKind) {
    if (!summary.canReact || pending) return;
    const next = summary.mine === kind ? null : kind;
    const before = summary;
    setSummary(applyReaction(summary, next));
    setPulse(next);
    setPickerOpen(false);
    setPending(true);
    const result = await react({ target: summary.target, kind: next });
    setPending(false);
    if (result?.data?.summary) setSummary(result.data.summary);
    else {
      setSummary(before);
      toast.error(result?.serverError ?? "Couldn't save your reaction. Please try again.");
    }
  }

  const used = REACTION_KINDS.filter((kind) => summary.counts[kind] > 0);
  const chip = size === "sm" ? "h-7 gap-1 px-2 text-xs" : "h-8 gap-1.5 px-2.5 text-[0.8rem]";
  const icon = size === "sm" ? "size-4" : "size-[1.1rem]";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="group" aria-label="Reactions">
      <AnimatePresence initial={false} mode="popLayout">
        {used.map((kind) => {
          const mine = summary.mine === kind;
          const label = `${REACTION_META[kind].label}: ${summary.counts[kind]}${mine ? " (yours)" : ""}`;
          return (
            <motion.button
              key={kind}
              layout
              type="button"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 520, damping: 30 }}
              onClick={() => (summary.canReact ? choose(kind) : setWhoOpen(true))}
              aria-pressed={summary.canReact ? mine : undefined}
              aria-label={summary.canReact ? label : `${label}. See who reacted`}
              title={summary.reason === "own" ? "See who reacted" : undefined}
              className={cn(
                "inline-flex items-center rounded-full border font-semibold tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                chip,
                mine
                  ? "border-primary/25 bg-secondary text-secondary-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <motion.span
                key={pulse === kind ? `pulse-${summary.counts[kind]}` : "still"}
                initial={pulse === kind ? { scale: 0.4, rotate: -12 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 14 }}
                className="inline-flex"
              >
                <ReactionIcon kind={kind} className={icon} />
              </motion.span>
              <span>{summary.counts[kind]}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>

      {summary.canReact ? (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size={size === "sm" ? "icon-sm" : "icon"}
                  className={cn(
                    "rounded-full text-muted-foreground hover:text-foreground",
                    size === "md" && "size-8",
                    summary.mine && used.length && "hidden sm:inline-flex",
                  )}
                  aria-label={summary.mine ? "Change your reaction" : "Add a reaction"}
                >
                  <SmilePlus />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>React</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" sideOffset={6} className="w-auto rounded-2xl p-1.5">
            <div className="flex items-center gap-0.5" role="group" aria-label="Choose a reaction">
              {REACTION_KINDS.map((kind, index) => (
                <motion.button
                  key={kind}
                  type="button"
                  initial={{ opacity: 0, y: 6, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: index * 0.025, type: "spring", stiffness: 500, damping: 26 }}
                  whileHover={{ scale: 1.22, y: -3 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => choose(kind)}
                  aria-label={REACTION_META[kind].label}
                  aria-pressed={summary.mine === kind}
                  title={REACTION_META[kind].label}
                  className={cn(
                    "grid size-11 place-items-center rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    summary.mine === kind && "bg-secondary",
                  )}
                >
                  <ReactionIcon kind={kind} className="size-7" />
                </motion.button>
              ))}
            </div>
            {summary.total > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setWhoOpen(true);
                }}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <UsersRound className="size-3.5" /> See who reacted
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}

      <ReactorsDialog summary={summary} open={whoOpen} onOpenChange={setWhoOpen} />
    </div>
  );
}

function ReactorsDialog({
  summary,
  open,
  onOpenChange,
}: {
  summary: ReactionSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reactors, setReactors] = useState<Reactor[] | null>(null);
  const [filter, setFilter] = useState<ReactionKind | "all">("all");

  async function load() {
    setReactors(null);
    const result = await loadReactors(summary.target);
    if (result?.data) setReactors(result.data.reactors);
    else {
      toast.error(result?.serverError ?? "Couldn't load reactions.");
      onOpenChange(false);
    }
  }

  const visible = reactors?.filter((reactor) => filter === "all" || reactor.kind === filter) ?? [];
  const kinds = REACTION_KINDS.filter((kind) => summary.counts[kind] > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setFilter("all");
          void load();
        }
      }}
    >
      <DialogContent className="gap-3 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reactions</DialogTitle>
          <DialogDescription>
            {summary.total === 1 ? "1 person reacted" : `${summary.total} people reacted`}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by reaction">
          {(["all", ...kinds] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={filter === kind}
              onClick={() => setFilter(kind)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums transition-colors",
                filter === kind ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {kind === "all" ? "All" : <ReactionIcon kind={kind} className="size-4" />}
              {kind === "all" ? summary.total : summary.counts[kind]}
            </button>
          ))}
        </div>
        <ul className="-mx-2 max-h-80 overflow-y-auto">
          {reactors === null
            ? Array.from({ length: Math.min(4, Math.max(1, summary.total)) }, (_, index) => (
                <li key={index} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </li>
              ))
            : visible.map((reactor) => (
                <li key={reactor.user.id}>
                  <Link
                    href={profileHref(reactor.user)}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted"
                    onClick={() => onOpenChange(false)}
                  >
                    <span className="relative">
                      <UserAvatar userId={reactor.user.id} name={reactor.user.name} size="sm" />
                      <span className="absolute -right-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-card ring-2 ring-card">
                        <ReactionIcon kind={reactor.kind} className="size-3.5" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{reactor.user.name}</span>
                  </Link>
                </li>
              ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
