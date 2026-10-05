"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Inbox, LoaderCircle, Mail, MonitorSmartphone, NotebookPen, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SupportStatus } from "@/server/db/schema";
import { actionError } from "@/features/resources/client";
import { updateSupportTicketAction } from "../actions";
import { STAFF_STATUS_LABELS, TOPIC_LABELS } from "../lib";
import type { AdminTicketDTO } from "../queries";

const STATUS_ICON: Record<SupportStatus, typeof Clock3> = { open: Clock3, in_progress: LoaderCircle, resolved: CheckCircle2 };
const STATUS_TONE: Record<SupportStatus, string> = {
  open: "bg-brand-magenta/10 text-brand-magenta",
  in_progress: "bg-brand-apricot/25 text-foreground",
  resolved: "bg-success/15 text-success",
};

/** Staff queue for tech support requests (old admin/tech-support). */
export function SupportQueue({ tickets, timezone, emptyLabel }: { tickets: AdminTicketDTO[]; timezone: string; emptyLabel: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tickets.find((ticket) => ticket.id === openId) ?? null;

  if (!tickets.length) {
    return (
      <Empty className="rounded-xl border border-dashed py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Inbox zero</EmptyTitle>
          <EmptyDescription>{emptyLabel}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <ul className="grid gap-2">
        {tickets.map((ticket) => {
          const Icon = STATUS_ICON[ticket.status];
          return (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => setOpenId(ticket.id)}
                className="flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <UserAvatar userId={ticket.user.id} name={ticket.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{ticket.user.name}</span>
                    <span className="text-xs text-muted-foreground">{ticket.user.roleLabel}</span>
                    <Badge variant="outline" className="font-normal">
                      {TOPIC_LABELS[ticket.topic]}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{friendlyDate(ticket.createdAt, timezone)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground/85">{ticket.body}</p>
                  {ticket.reply ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Replied: {ticket.reply}</p> : null}
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[ticket.status])}>
                  <Icon className="size-3" aria-hidden />
                  {STAFF_STATUS_LABELS[ticket.status]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={Boolean(open)} onOpenChange={(value) => !value && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{open ? <TicketPanel key={open.id + open.updatedAt} ticket={open} timezone={timezone} onDone={() => setOpenId(null)} /> : null}</SheetContent>
      </Sheet>
    </>
  );
}

function TicketPanel({ ticket, timezone, onDone }: { ticket: AdminTicketDTO; timezone: string; onDone: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<SupportStatus>(ticket.status === "open" ? "in_progress" : ticket.status);
  const [reply, setReply] = useState(ticket.reply);
  const [staffNote, setStaffNote] = useState(ticket.staffNote);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateSupportTicketAction({ id: ticket.id, status, reply, staffNote });
      const error = actionError(result);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(status === "resolved" ? "Marked as resolved" : "Saved", {
        description: reply && reply !== ticket.reply ? "The member will see your reply and get a notification." : undefined,
      });
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{TOPIC_LABELS[ticket.topic]}</SheetTitle>
        <SheetDescription>
          From {ticket.user.name}
          {ticket.user.username ? ` (@${ticket.user.username})` : ""} · {friendlyDate(ticket.createdAt, timezone)}
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-5 px-4">
        <p className="rounded-xl bg-muted/60 p-4 text-sm whitespace-pre-line">{ticket.body}</p>
        <dl className="grid gap-2 text-sm">
          {ticket.user.email ? (
            <div className="flex items-center gap-2">
              <dt>
                <Mail className="size-4 text-muted-foreground" aria-label="Email" />
              </dt>
              <dd>
                <a href={`mailto:${ticket.user.email}`} className="text-primary hover:underline">
                  {ticket.user.email}
                </a>
              </dd>
            </div>
          ) : null}
          {ticket.device ? (
            <div className="flex items-center gap-2">
              <dt>
                <MonitorSmartphone className="size-4 text-muted-foreground" aria-label="Device" />
              </dt>
              <dd>{ticket.device}</dd>
            </div>
          ) : null}
          {ticket.handledByName ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <dt>
                <NotebookPen className="size-4" aria-label="Handled by" />
              </dt>
              <dd>Last handled by {ticket.handledByName}</dd>
            </div>
          ) : null}
        </dl>
        <div className="grid gap-2">
          <Label>Status</Label>
          <ToggleGroup type="single" variant="outline" value={status} onValueChange={(value) => value && setStatus(value as SupportStatus)} className="w-full">
            {(["open", "in_progress", "resolved"] as const).map((value) => (
              <ToggleGroupItem key={value} value={value} className="flex-1">
                {STAFF_STATUS_LABELS[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ticket-reply">Reply to the member</Label>
          <Textarea id="ticket-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={4} maxLength={2000} placeholder="Shown on their Tech support page, with a notification." />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ticket-note">Internal note</Label>
          <Textarea id="ticket-note" value={staffNote} onChange={(event) => setStaffNote(event.target.value)} rows={3} maxLength={5000} placeholder="Only staff see this." />
        </div>
      </div>
      <SheetFooter>
        <Button onClick={save} disabled={pending} size="lg">
          {pending ? <Spinner /> : <Save />}
          Save
        </Button>
      </SheetFooter>
    </>
  );
}
