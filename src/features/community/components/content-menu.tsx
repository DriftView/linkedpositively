"use client";

import { Ellipsis, Flag, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatInZone, shortAgo } from "@/lib/dates";

/** "3h" with the full date on hover; stable across server/client render. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  return (
    <time
      dateTime={iso}
      title={formatInZone(iso, "EEEE, MMM d, yyyy 'at' h:mm a")}
      className={className}
      suppressHydrationWarning
    >
      {shortAgo(iso)}
    </time>
  );
}

/**
 * The "…" menu on posts and comments: edit/delete for the author (delete
 * also for moderators), "Report as inappropriate" for everyone else.
 */
export function ContentMenu({
  noun,
  canEdit,
  canDelete,
  canReport,
  reported,
  moderatorDelete,
  onEdit,
  onDelete,
  onReport,
  className,
}: {
  noun: "post" | "comment";
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  reported: boolean;
  /** Deleting someone else's content as a moderator. */
  moderatorDelete?: boolean;
  onEdit?: () => void;
  onDelete: () => Promise<boolean>;
  onReport: () => Promise<boolean>;
  className?: string;
}) {
  const [confirm, setConfirm] = useState<"delete" | "report" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canEdit && !canDelete && !canReport) return null;

  async function run() {
    setBusy(true);
    const ok = confirm === "delete" ? await onDelete() : await onReport();
    setBusy(false);
    if (ok) setConfirm(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-9 rounded-full text-muted-foreground hover:text-foreground", className)}
            aria-label={`${noun === "post" ? "Post" : "Comment"} options`}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canEdit ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit {noun}
            </DropdownMenuItem>
          ) : null}
          {canReport ? (
            <DropdownMenuItem disabled={reported} onSelect={() => setConfirm("report")}>
              <Flag /> {reported ? "Reported" : "Report as inappropriate"}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              {canEdit || canReport ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                <Trash2 /> Delete {noun}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? `Delete this ${noun}?` : `Report this ${noun}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? moderatorDelete
                  ? `This removes the ${noun} for everyone${noun === "post" ? ", with its comments and reactions" : ""}. It can't be undone.`
                  : `It will be removed for everyone${noun === "post" ? ", along with its comments and reactions" : ""}. This can't be undone.`
                : `The study team will take a look. The author won't know who reported it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              onClick={(event) => {
                event.preventDefault();
                void run();
              }}
              disabled={busy}
            >
              {busy ? <Spinner /> : null}
              {confirm === "delete" ? "Delete" : "Report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
