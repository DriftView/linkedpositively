"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BellOff, CheckCheck, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { dismissAllNotifications, dismissNotification, loadMoreNotifications, restoreNotification } from "../actions";
import { NotificationCard } from "./notification-card";
import type { NotificationDTO } from "./types";

/** Optimistic dismiss with an undo toast. */
export function useDismiss(setItems: React.Dispatch<React.SetStateAction<NotificationDTO[]>>) {
  return async (item: NotificationDTO, index: number) => {
    setItems((list) => list.filter((entry) => entry.id !== item.id));
    const result = await dismissNotification({ id: item.id });
    if (!result?.data?.ok) {
      setItems((list) => insertAt(list, item, index));
      toast.error("Couldn't dismiss that. Please try again.");
      return;
    }
    toast("Notification dismissed", {
      action: {
        label: "Undo",
        onClick: async () => {
          setItems((list) => insertAt(list, item, index));
          await restoreNotification({ id: item.id });
        },
      },
    });
  };
}

function insertAt(list: NotificationDTO[], item: NotificationDTO, index: number) {
  if (list.some((entry) => entry.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

/** The notification centre list: "New" then "Earlier", load more, clear all. */
export function NotificationList({
  initialItems,
  initialCursor,
  seen,
}: {
  initialItems: NotificationDTO[];
  initialCursor: string | null;
  seen: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const dismiss = useDismiss(setItems);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const result = await loadMoreNotifications({ cursor, seen });
    setLoading(false);
    if (!result?.data) {
      setFailed(true);
      return;
    }
    const known = new Set(items.map((item) => item.id));
    setItems((list) => [...list, ...result.data!.items.filter((item) => !known.has(item.id))]);
    setCursor(result.data.nextCursor);
  }

  async function clearAll() {
    setClearing(true);
    const result = await dismissAllNotifications();
    setClearing(false);
    if (result?.data) {
      setItems([]);
      setCursor(null);
      toast.success("All cleared");
    } else toast.error("Couldn't clear your notifications. Please try again.");
  }

  if (!items.length && !cursor) {
    return (
      <Empty className="rounded-2xl border bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12 rounded-full bg-secondary text-primary">
            <BellOff className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-base">You&apos;re all caught up</EmptyTitle>
          <EmptyDescription>
            When someone comments on or reacts to your posts, or tags you, you&apos;ll hear about it here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild className="rounded-full">
            <Link href="/">Go to your wall</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const fresh = items.filter((item) => item.isNew);
  const earlier = items.filter((item) => !item.isNew);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-muted-foreground" disabled={clearing}>
              {clearing ? <Spinner /> : <CheckCheck />} Clear all
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
              <AlertDialogDescription>They&apos;ll be removed from this list. New ones will still arrive.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void clearAll()}>Clear all</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {[
        { label: "New", list: fresh },
        { label: "Earlier", list: earlier },
      ].map((group) =>
        group.list.length ? (
          <section key={group.label} aria-label={group.label}>
            <h2 className="mb-2.5 px-1 font-sans text-xs font-bold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
            <ul className="space-y-2.5">
              <AnimatePresence initial={false}>
                {group.list.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <NotificationCard item={item} onDismiss={() => void dismiss(item, items.indexOf(item))} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ) : null,
      )}
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-full" onClick={() => void more()} disabled={loading}>
            {loading ? <Spinner /> : failed ? <RotateCw /> : null}
            {failed ? "Try again" : "Show older"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
