"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Lock, MessageCirclePlus, MessagesSquare, MoreHorizontal, RotateCcw, SendHorizontal, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { dayKey, formatInZone, shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteMessageForMe, deleteThreadForMe, markThreadRead, replyToThread, startThread } from "../message-actions";
import type { PersonRef, ThreadDetail, ThreadMessage, ThreadSummary } from "../types";
import { actionError } from "./action-result";
import { AutoTextarea } from "./auto-textarea";
import { EmptyState } from "./bits";

export type MessagesRouting = {
  /** List URL, e.g. "/coaching/messages". */
  base: string;
  /** "path": threads at {base}/{id}; "query": {base}?thread={id}. */
  mode: "path" | "query";
};

export type ComposeOptions =
  | { kind: "fixed"; recipient: PersonRef; participantId?: string; recipientNote?: string }
  | { kind: "choose"; recipients: PersonRef[] }
  | { kind: "disabled"; reason: string };

function threadHref(routing: MessagesRouting, id: string) {
  return routing.mode === "path" ? `${routing.base}/${id}` : `${routing.base}?thread=${id}`;
}
function newHref(routing: MessagesRouting) {
  return `${routing.base}?new=1`;
}

/**
 * Conversations between a participant and their peer navigator. Used by the
 * participant (/coaching/messages), the coach inbox (/coach/messages) and the
 * per-participant Messages tab.
 */
export function MessagesView({
  threads,
  active,
  composing,
  compose,
  routing,
  timezone,
  twoPane,
}: {
  threads: ThreadSummary[];
  active: ThreadDetail | null;
  composing: boolean;
  compose: ComposeOptions;
  routing: MessagesRouting;
  timezone: string;
  /** Show list and conversation side by side on wide containers. */
  twoPane: boolean;
}) {
  const showingDetail = Boolean(active) || composing;
  const canCompose = compose.kind !== "disabled";

  const list = (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Conversations</h2>
        {canCompose ? (
          <Button asChild size="lg" variant={composing ? "secondary" : "default"} className={cn(!twoPane && "rounded-full")}>
            <Link href={newHref(routing)} scroll={false}>
              <MessageCirclePlus aria-hidden />
              New message
            </Link>
          </Button>
        ) : null}
      </div>
      {compose.kind === "disabled" ? (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {compose.reason}
        </p>
      ) : null}
      {threads.length ? (
        <ul className="space-y-1" aria-label="Conversations">
          {threads.map((thread) => {
            const selected = active?.id === thread.id;
            return (
              <li key={thread.id}>
                <Link
                  href={threadHref(routing, thread.id)}
                  scroll={false}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex gap-3 rounded-xl px-3 py-3 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "bg-secondary" : "hover:bg-muted/70",
                    !twoPane && !selected && "border bg-card shadow-soft",
                  )}
                >
                  {thread.other ? <UserAvatar userId={thread.other.id} name={thread.other.name} size="md" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", thread.unread ? "font-semibold" : "font-medium")}>{thread.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{shortAgo(thread.lastMessageAt, timezone)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[0.8rem]", thread.unread ? "text-foreground" : "text-muted-foreground")}>
                        {thread.lastFromMe ? "You: " : thread.other ? `${thread.other.name.split(" ")[0]}: ` : ""}
                        {thread.preview}
                      </span>
                      {thread.unread ? (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-magenta px-1.5 text-[0.68rem] font-semibold text-primary-foreground tabular-nums">
                          <span className="sr-only">Unread: </span>
                          {thread.unread}
                        </span>
                      ) : null}
                    </span>
                    {!thread.canReply ? <span className="mt-1 block text-[0.7rem] text-muted-foreground">Closed</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={MessagesSquare}
          title="No messages yet"
          description={canCompose ? "Start a conversation. Replies show up here." : "Messages will show up here."}
          className="py-8"
        />
      )}
    </div>
  );

  const detail = composing ? (
    <NewConversation compose={compose} routing={routing} />
  ) : active ? (
    <Conversation key={active.id} thread={active} routing={routing} timezone={timezone} />
  ) : (
    <div className="grid h-full min-h-72 place-items-center rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      <div>
        <MessagesSquare aria-hidden className="mx-auto mb-2 size-6" />
        Choose a conversation to read it.
      </div>
    </div>
  );

  if (!twoPane) return showingDetail ? detail : list;

  return (
    <div className="@container">
      <div className="grid gap-5 @3xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className={cn(showingDetail && "@max-3xl:hidden")}>{list}</div>
        <div className={cn("min-w-0", !showingDetail && "@max-3xl:hidden")}>{detail}</div>
      </div>
    </div>
  );
}

function BackLink({ routing }: { routing: MessagesRouting }) {
  return (
    <Link
      href={routing.base}
      scroll={false}
      className="mb-3 inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All conversations
    </Link>
  );
}

type LocalMessage = ThreadMessage & { state?: "sending" | "failed" };

function Conversation({ thread, routing, timezone }: { thread: ThreadDetail; routing: MessagesRouting; timezone: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<LocalMessage[]>(thread.messages);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const firstUnread = thread.messages.find((m) => m.unread)?.id;

  const [lastServer, setLastServer] = useState(thread.messages);
  if (thread.messages !== lastServer) {
    setLastServer(thread.messages);
    setMessages((local) => [...thread.messages, ...local.filter((m) => m.state === "failed")]);
  }

  // Mark as read when opened (and when new messages arrive).
  const unreadCount = thread.unread;
  useEffect(() => {
    if (!unreadCount) return;
    void markThreadRead({ id: thread.id }).then(() => router.refresh());
  }, [thread.id, unreadCount, router]);

  // Keep the conversation fresh while it's open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  function send(body: string, retryId?: string) {
    const text = body.trim();
    if (!text) return;
    const tempId = retryId ?? `temp-${++seq.current}`;
    const optimistic: LocalMessage = { id: tempId, body: text, createdAt: new Date().toISOString(), author: null, mine: true, unread: false, state: "sending" };
    setMessages((list) => (retryId ? list.map((m) => (m.id === retryId ? optimistic : m)) : [...list, optimistic]));
    if (!retryId) setDraft("");
    startTransition(async () => {
      const result = await replyToThread({ threadId: thread.id, body: text });
      const error = actionError(result);
      if (error || !result?.data) {
        setMessages((list) => list.map((m) => (m.id === tempId ? { ...m, state: "failed" } : m)));
        toast.error(error ?? "Your message wasn't sent.");
        return;
      }
      setMessages((list) => list.map((m) => (m.id === tempId ? result.data!.message : m)));
      router.refresh();
    });
  }

  async function hideMessage(id: string) {
    const previous = messages;
    setMessages((list) => list.filter((m) => m.id !== id));
    const result = await deleteMessageForMe({ id });
    const error = actionError(result);
    if (error) {
      setMessages(previous);
      toast.error(error);
    } else toast("Message deleted for you");
  }

  async function hideThread() {
    const result = await deleteThreadForMe({ id: thread.id });
    const error = actionError(result);
    if (error) return toast.error(error);
    toast("Conversation deleted for you", { description: "It comes back if a new message arrives." });
    router.push(routing.base);
    router.refresh();
  }

  const dayBreaks = new Set(
    messages.filter((m, i) => i === 0 || dayKey(m.createdAt, timezone) !== dayKey(messages[i - 1].createdAt, timezone)).map((m) => m.id),
  );
  return (
    <div className="flex min-h-[28rem] flex-col">
      <div className="@3xl:hidden">
        <BackLink routing={routing} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-soft">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          {thread.other ? <UserAvatar userId={thread.other.id} name={thread.other.name} size="md" /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-sans text-[0.95rem] font-semibold">{thread.subject}</h2>
            <p className="truncate text-xs text-muted-foreground">with {thread.other?.name ?? "someone"}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" aria-label="Delete conversation">
                <Trash2 aria-hidden />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  It&apos;s removed only for you. {thread.other?.name ?? "The other person"} still sees it, and it comes back if a new message arrives.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void hideThread()}>
                  Delete for me
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        <div className="max-h-[60vh] min-h-64 flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="Messages">
          {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No messages left in this conversation.</p> : null}
          <ol className="space-y-1.5">
            <AnimatePresence initial={false}>
              {messages.map((message) => {
                const showDay = dayBreaks.has(message.id);
                return (
                  <Fragment key={message.id}>
                    {showDay ? (
                      <li className="py-2 text-center text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                        {formatInZone(message.createdAt, "EEEE, MMM d", timezone)}
                      </li>
                    ) : null}
                    {message.id === firstUnread ? (
                      <li className="flex items-center gap-2 py-1 text-[0.7rem] font-semibold text-brand-magenta" aria-label="New messages below">
                        <span className="h-px flex-1 bg-brand-magenta/30" />
                        New
                        <span className="h-px flex-1 bg-brand-magenta/30" />
                      </li>
                    ) : null}
                    <motion.li
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className={cn("group flex items-end gap-1.5", message.mine ? "flex-row-reverse" : "")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap shadow-xs",
                          message.mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
                          message.state === "sending" && "opacity-70",
                          message.state === "failed" && "bg-destructive/15 text-foreground ring-1 ring-destructive/40",
                        )}
                      >
                        <span className="sr-only">{message.mine ? "You" : (message.author?.name ?? "They")} said: </span>
                        {message.body}
                        <span className={cn("mt-0.5 block text-right text-[0.65rem]", message.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {message.state === "sending" ? "Sending…" : message.state === "failed" ? "Not sent" : formatInZone(message.createdAt, "h:mm a", timezone)}
                        </span>
                      </div>
                      {message.state === "failed" ? (
                        <Button size="icon-sm" variant="ghost" aria-label="Try sending again" onClick={() => send(message.body, message.id)}>
                          <RotateCcw aria-hidden />
                        </Button>
                      ) : message.state === "sending" ? null : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-60"
                              aria-label="Message options"
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={message.mine ? "end" : "start"}>
                            <DropdownMenuItem variant="destructive" onSelect={() => void hideMessage(message.id)}>
                              <Trash2 aria-hidden />
                              Delete for me
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </motion.li>
                  </Fragment>
                );
              })}
            </AnimatePresence>
          </ol>
          <div ref={endRef} />
        </div>

        {thread.canReply ? (
          <Composer value={draft} onChange={setDraft} onSend={() => send(draft)} placeholder={`Reply to ${thread.other?.name.split(" ")[0] ?? "them"}`} />
        ) : (
          <p className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Lock aria-hidden className="size-4" />
            This conversation is closed because the peer navigator assignment changed.
          </p>
        )}
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSend, placeholder, pending }: { value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; pending?: boolean }) {
  return (
    <form
      className="flex items-end gap-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <AutoTextarea
        aria-label="Message"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minRows={1}
        maxLength={5000}
        className="max-h-40 rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <Button type="submit" size="icon-lg" className="size-10 shrink-0 rounded-full" disabled={!value.trim() || pending} aria-label="Send message">
        {pending ? <Spinner /> : <SendHorizontal aria-hidden />}
      </Button>
    </form>
  );
}

function NewConversation({ compose, routing }: { compose: ComposeOptions; routing: MessagesRouting }) {
  const router = useRouter();
  const [recipient, setRecipient] = useState(compose.kind === "choose" && compose.recipients.length === 1 ? compose.recipients[0].id : "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (compose.kind === "disabled") {
    return (
      <div>
        <BackLink routing={routing} />
        <EmptyState icon={Lock} title="Messaging isn't available yet" description={compose.reason} />
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (compose.kind === "choose" && !recipient) return setError("Choose who to message.");
    if (!body.trim()) return setError("Write a message first.");
    setError(null);
    const participantId = compose.kind === "choose" ? recipient : compose.kind === "fixed" ? compose.participantId : undefined;
    startTransition(async () => {
      const result = await startThread({ participantId, subject: subject.trim() || undefined, body });
      const message = actionError(result);
      if (message || !result?.data) return setError(message ?? "Your message wasn't sent.");
      toast.success("Message sent");
      router.push(threadHref(routing, result.data.threadId));
      router.refresh();
    });
  }

  return (
    <div>
      <div className="@3xl:hidden">
        <BackLink routing={routing} />
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="font-sans text-[0.95rem] font-semibold">New message</h2>
        {compose.kind === "fixed" ? (
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
            <UserAvatar userId={compose.recipient.id} name={compose.recipient.name} size="sm" />
            <p className="text-sm">
              To <span className="font-medium">{compose.recipient.name}</span>
              {compose.recipientNote ? <span className="text-muted-foreground"> · {compose.recipientNote}</span> : null}
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="msg-to" className="mb-1.5 block text-sm font-medium">
              To
            </label>
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger id="msg-to" className="h-10 w-full">
                <SelectValue placeholder="Choose a participant" />
              </SelectTrigger>
              <SelectContent>
                {compose.recipients.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name} <span className="text-muted-foreground">@{person.username}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label htmlFor="msg-subject" className="mb-1.5 block text-sm font-medium">
            Subject <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className="h-10" placeholder="What's it about?" />
        </div>
        <div>
          <label htmlFor="msg-body" className="mb-1.5 block text-sm font-medium">
            Message
          </label>
          <AutoTextarea id="msg-body" value={body} onChange={(e) => setBody(e.target.value)} minRows={4} maxLength={5000} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button asChild type="button" variant="ghost" size="lg">
            <Link href={routing.base} scroll={false}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" size="lg" disabled={pending} className="rounded-full px-4">
            {pending ? <Spinner /> : <SendHorizontal aria-hidden />}
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
