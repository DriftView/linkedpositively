"use client";

import { useRouter } from "next/navigation";
import { LogOut, Monitor, Smartphone, Tablet } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { shortAgo } from "@/lib/dates";

export type SessionDto = { id: string; device: string; kind: "phone" | "tablet" | "computer"; lastActive: string; current: boolean };

const ICONS = { phone: Smartphone, tablet: Tablet, computer: Monitor };

/** Where you're signed in, with "sign out everywhere else". */
export function SessionsCard({ sessions: initial, timezone }: { sessions: SessionDto[]; timezone: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initial);
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sessions : sessions.slice(0, 4);
  const others = sessions.filter((session) => !session.current).length;

  async function signOutOthers() {
    setPending(true);
    const { error } = await authClient.revokeOtherSessions();
    setPending(false);
    if (error) return void toast.error("We couldn't sign out your other devices. Please try again.");
    setSessions((current) => current.filter((session) => session.current));
    toast.success("You're signed out everywhere else.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border/70 rounded-xl border">
        {visible.map((session) => {
          const Icon = ICONS[session.kind];
          return (
            <li key={session.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{session.device}</p>
                <p className="text-xs text-muted-foreground">
                  {session.current ? "This device" : activeLabel(session.lastActive, timezone)}
                </p>
              </div>
              {session.current ? (
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">Current</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {sessions.length > visible.length ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="-mt-1 h-9 text-sm font-medium text-primary hover:underline"
        >
          Show {sessions.length - visible.length} more
        </button>
      ) : null}
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="h-11 rounded-full px-5" disabled={!others || pending}>
              {pending ? <Spinner /> : <LogOut />}
              {others ? `Sign out ${others} other ${others === 1 ? "device" : "devices"}` : "No other devices"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out everywhere else?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ll stay signed in here. Anyone using your account on another phone or computer will need your password to get back in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={signOutOthers}>Sign out other devices</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function activeLabel(iso: string, timezone: string) {
  const ago = shortAgo(iso, timezone);
  if (ago === "just now") return "Active just now";
  return /^\d+[smhd]$/.test(ago) ? `Active ${ago} ago` : `Last active ${ago}`;
}
