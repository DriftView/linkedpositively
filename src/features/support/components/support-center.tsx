"use client";

import { CheckCircle2, Clock3, Inbox, LoaderCircle, MessageSquareReply, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SupportStatus, SupportTopic } from "@/server/db/schema";
import { actionError, fieldErrors } from "@/features/resources/client";
import { submitSupportTicketAction } from "../actions";
import { describeDevice, STATUS_LABELS, TOPIC_LABELS } from "../lib";
import type { MyTicketDTO } from "../queries";

const STATUS_STYLE: Record<SupportStatus, { icon: typeof Clock3; className: string }> = {
  open: { icon: Clock3, className: "bg-brand-sky/15 text-foreground" },
  in_progress: { icon: LoaderCircle, className: "bg-brand-apricot/25 text-foreground" },
  resolved: { icon: CheckCircle2, className: "bg-success/15 text-success" },
};

/** Tech support form (old "TWM Feedback Form") and the member's own requests. */
export function SupportCenter({ initialTickets, timezone }: { initialTickets: MyTicketDTO[]; timezone: string }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [topic, setTopic] = useState<SupportTopic>("app");
  const [body, setBody] = useState("");
  const [includeDevice, setIncludeDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const device = useSyncExternalStore(
    noopSubscribe,
    () => describeDevice(navigator.userAgent, window.screen.width, window.screen.height),
    () => "",
  );
  // Take fresh server data after a refresh.
  const [lastInitial, setLastInitial] = useState(initialTickets);
  if (lastInitial !== initialTickets) {
    setLastInitial(initialTickets);
    setTickets(initialTickets);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitSupportTicketAction({ topic, body, device: includeDevice ? device : undefined });
      const fields = fieldErrors(result);
      if (fields.body) {
        setError(fields.body);
        return;
      }
      const message = actionError(result);
      if (message || !result?.data) {
        toast.error(message ?? "Couldn't send your message.");
        return;
      }
      const created = result.data;
      setTickets((current) => [created, ...current]);
      setSentId(created.id);
      setBody("");
      toast.success("Message sent", { description: "The team will get back to you here." });
    });
  }

  return (
    <div className="grid gap-8">
      <form onSubmit={submit} className="rounded-3xl border bg-card p-5 shadow-soft sm:p-7">
        <fieldset>
          <legend className="font-heading text-lg font-semibold">What&apos;s it about?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(TOPIC_LABELS) as SupportTopic[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={topic === key}
                onClick={() => setTopic(key)}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-medium transition-all active:scale-[0.97]",
                  topic === key ? "border-primary bg-primary text-primary-foreground shadow-soft" : "bg-card hover:border-primary/40",
                )}
              >
                {TOPIC_LABELS[key]}
              </button>
            ))}
          </div>
        </fieldset>

        <Label htmlFor="support-body" className="mt-6 mb-2 block font-heading text-lg font-semibold">
          What&apos;s going on?
        </Label>
        <Textarea
          id="support-body"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            if (error) setError(null);
          }}
          rows={6}
          maxLength={5000}
          placeholder="Enter the technical problem details: what you were trying to do, what happened, and any error message you saw."
          aria-invalid={Boolean(error)}
          aria-describedby="support-help"
          className="rounded-2xl text-[0.95rem]"
        />
        <div id="support-help" className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
          {error ? (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          ) : (
            <span>Please don&apos;t include health details. The study team reads every message.</span>
          )}
          <span className="shrink-0 tabular-nums">{body.length}/5000</span>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/50 p-3 text-sm">
          <Checkbox checked={includeDevice} onCheckedChange={(value) => setIncludeDevice(value === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">Include my device info</span>
            <span className="block text-muted-foreground">{device || "Your browser and screen size"}, to help us fix it faster.</span>
          </span>
        </label>

        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={pending || !body.trim()} className="h-11 rounded-full px-6 font-semibold">
            {pending ? <Spinner /> : <Send aria-hidden />}
            Send to tech support
          </Button>
        </div>
      </form>

      <section aria-labelledby="my-requests">
        <h2 id="my-requests" className="mb-3 px-1 text-lg font-semibold">
          Your requests
        </h2>
        {tickets.length ? (
          <ul className="grid gap-2.5">
            <AnimatePresence initial={false}>
              {tickets.map((ticket) => {
                const style = STATUS_STYLE[ticket.status];
                return (
                  <motion.li
                    key={ticket.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("rounded-2xl border bg-card p-4 shadow-soft", sentId === ticket.id && "ring-2 ring-primary/30")}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", style.className)}>
                        <style.icon aria-hidden className="size-3.5" />
                        {STATUS_LABELS[ticket.status]}
                      </span>
                      <span className="font-medium">{TOPIC_LABELS[ticket.topic]}</span>
                      <span className="ml-auto text-muted-foreground">{shortAgo(ticket.createdAt, timezone)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-[0.95rem] text-foreground/85">{ticket.body}</p>
                    {ticket.reply ? (
                      <div className="mt-3 flex gap-2.5 rounded-xl bg-secondary p-3 text-sm">
                        <MessageSquareReply aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div>
                          <p className="font-semibold text-secondary-foreground">Reply from tech support</p>
                          <p className="mt-0.5 whitespace-pre-line text-foreground/85">{ticket.reply}</p>
                        </div>
                      </div>
                    ) : null}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-muted/30 p-5 text-sm text-muted-foreground">
            <Inbox aria-hidden className="size-5 shrink-0" />
            You haven&apos;t sent any requests. When you do, you can follow them here.
          </div>
        )}
      </section>
    </div>
  );
}

function noopSubscribe() {
  return () => {};
}
