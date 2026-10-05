"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, ExternalLink, Flag, ImageIcon, PlayCircle, ShieldCheck, ShieldOff, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { friendlyDate } from "@/lib/dates";
import { moderate } from "../actions";
import type { ModerationItem } from "../moderation";

type Action = "delete" | "clear" | "whitelist" | "unwhitelist";

const DONE: Record<Action, string> = {
  delete: "Deleted",
  clear: "Reports cleared",
  whitelist: "Whitelisted: new reports will be ignored",
  unwhitelist: "Removed from the whitelist",
};

/** A moderation list (reported posts, reported comments, or the whitelist). */
export function ModerationQueue({
  items: initial,
  view,
  emptyTitle,
  emptyText,
}: {
  items: ModerationItem[];
  view: "open" | "whitelisted";
  emptyTitle: string;
  emptyText: string;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(item: ModerationItem, action: Action) {
    setBusy(`${item.id}:${action}`);
    const result = await moderate({ type: item.type, id: item.id, action });
    setBusy(null);
    if (!result?.data) {
      toast.error(result?.serverError ?? "That didn't work. Please try again.");
      return;
    }
    setItems((list) => list.filter((entry) => entry.id !== item.id));
    toast.success(DONE[action]);
  }

  if (!items.length) {
    return (
      <Empty className="rounded-xl border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-11 rounded-full bg-success/15 text-success">
            <Check className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-base">{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyText}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.id}
            layout
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_16rem_auto] lg:items-start"
          >
            <div className="flex min-w-0 gap-3">
              <UserAvatar userId={item.author.id} name={item.author.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold">{item.author.name}</span>
                  {item.author.username ? <span className="text-muted-foreground">@{item.author.username}</span> : null}
                  <span className="text-muted-foreground">· {friendlyDate(item.createdAt)}</span>
                  {item.context ? <Badge variant="secondary">{item.context}</Badge> : null}
                </div>
                {item.headline ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                    <TriangleAlert className="size-4 text-warning-foreground dark:text-warning" /> CW: {item.headline}
                  </p>
                ) : null}
                {item.text ? <p className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-foreground/90">{item.text}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.photoUrl ? (
                    <a href={item.photoUrl} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private media thumbnail */}
                      <img src={item.photoUrl} alt="Attached photo" className="h-16 w-20 rounded-md border object-cover" />
                    </a>
                  ) : null}
                  {item.hasVideo ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <PlayCircle className="size-3.5" /> YouTube video
                    </span>
                  ) : null}
                  {!item.text && !item.photoUrl && !item.hasVideo ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ImageIcon className="size-3.5" /> No text
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="text-sm">
              {view === "open" ? (
                <>
                  <p className="flex items-center gap-1.5 font-semibold text-destructive">
                    <Flag className="size-4" /> {item.reports.length} {item.reports.length === 1 ? "report" : "reports"}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {item.reports.slice(0, 4).map((report) => (
                      <li key={report.reporter.id + report.at} className="truncate">
                        {report.reporter.name} · {friendlyDate(report.at)}
                      </li>
                    ))}
                    {item.reports.length > 4 ? <li>and {item.reports.length - 4} more</li> : null}
                  </ul>
                </>
              ) : (
                <p className="text-muted-foreground">
                  <ShieldCheck className="mr-1 inline size-4 text-success" />
                  Whitelisted {item.whitelistedAt ? friendlyDate(item.whitelistedAt) : ""}
                  {item.whitelistedBy ? ` by ${item.whitelistedBy.name}` : ""}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" aria-label="Open in the app">
                    <Link href={item.href} target="_blank">
                      <ExternalLink />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in the app</TooltipContent>
              </Tooltip>
              {view === "open" ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => void run(item, "clear")} disabled={Boolean(busy)}>
                    {busy === `${item.id}:clear` ? <Spinner /> : <Check />} Clear
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void run(item, "whitelist")} disabled={Boolean(busy)}>
                    {busy === `${item.id}:whitelist` ? <Spinner /> : <ShieldCheck />} Whitelist
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void run(item, "unwhitelist")} disabled={Boolean(busy)}>
                  {busy === `${item.id}:unwhitelist` ? <Spinner /> : <ShieldOff />} Remove from whitelist
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={Boolean(busy)}>
                    {busy === `${item.id}:delete` ? <Spinner /> : <Trash2 />} Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this {item.type}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It will be removed for everyone{item.type === "post" ? ", with its comments and reactions" : ""}. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void run(item, "delete")}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
