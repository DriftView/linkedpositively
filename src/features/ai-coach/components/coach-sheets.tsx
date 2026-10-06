"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, LifeBuoy, MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { hideConversationAction, savePreferencesAction } from "../actions";
import { COACH_LOOKS, CRISIS_LINES } from "../constants";
import type { AiPreferencesDTO, ConversationSummaryDTO } from "../types";
import { CoachAvatar } from "./coach-avatar";

export function HistorySheet({
  open,
  onOpenChange,
  conversations,
  currentId,
  basePath,
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationSummaryDTO[];
  currentId: string | null;
  basePath: string;
  timezone: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function clear(id: string) {
    setPending(true);
    const result = await hideConversationAction({ conversationId: id });
    setPending(false);
    setConfirming(null);
    if (result?.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Conversation cleared");
    onOpenChange(false);
    if (id === currentId) router.push(basePath);
    else router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(22rem,92vw)]">
        <SheetHeader>
          <SheetTitle>Your conversations</SheetTitle>
          <SheetDescription>Pick up where you left off. Clearing a conversation removes it from this list.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {conversations.length === 0 ? (
            <p className="rounded-xl bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id} className={cn("group flex items-center gap-1 rounded-xl", conversation.id === currentId && "bg-secondary")}>
                  <Link
                    href={`${basePath}?c=${conversation.id}`}
                    onClick={() => onOpenChange(false)}
                    aria-current={conversation.id === currentId ? "page" : undefined}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <MessageSquareText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{conversation.title}</span>
                      <span className="block text-xs text-muted-foreground">{shortAgo(conversation.lastMessageAt, timezone)}</span>
                    </span>
                  </Link>
                  {confirming === conversation.id ? (
                    <Button size="sm" variant="destructive" className="h-9 rounded-full" disabled={pending} onClick={() => clear(conversation.id)}>
                      {pending ? <Spinner /> : null}
                      Clear
                    </Button>
                  ) : (
                    <Button
                      size="icon-lg"
                      variant="ghost"
                      className="size-10 text-muted-foreground"
                      aria-label={`Clear “${conversation.title}”`}
                      onClick={() => setConfirming(conversation.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Conversations are part of the research study and are kept securely by the study team, even after you clear them from this list.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  preferences,
  onChange,
  voiceEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: AiPreferencesDTO;
  onChange: (next: AiPreferencesDTO) => void;
  voiceEnabled: boolean;
}) {
  async function update(patch: Partial<AiPreferencesDTO>) {
    const next = { ...preferences, ...patch };
    onChange(next);
    const result = await savePreferencesAction(next);
    if (result?.serverError) {
      toast.error(result.serverError);
      onChange(preferences);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(24rem,92vw)]">
        <SheetHeader>
          <SheetTitle>Coach settings</SheetTitle>
          <SheetDescription>Make the coach yours.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Your coach</legend>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Coach look">
              {COACH_LOOKS.map((look) => {
                const selected = preferences.look === look.id;
                return (
                  <button
                    key={look.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update({ look: look.id })}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-xl border p-1.5 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected && "border-primary bg-secondary",
                    )}
                  >
                    <CoachAvatar look={look.id} state="idle" size={56} />
                    {look.name}
                    {selected ? <Check aria-hidden className="absolute top-1 right-1 size-3.5 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-start justify-between gap-4">
            <label htmlFor="ai-personalize" className="text-sm">
              <span className="font-semibold">Personalize my answers</span>
              <span className="mt-0.5 block text-muted-foreground">
                Let the coach use your first name, pronouns and the location on your profile. Your check-ins, trackers and health answers are never shared with it.
                Applies to new conversations.
              </span>
            </label>
            <Switch id="ai-personalize" checked={preferences.personalize} onCheckedChange={(personalize) => update({ personalize })} />
          </div>

          {voiceEnabled ? (
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="ai-autospeak" className="text-sm">
                <span className="font-semibold">Read replies aloud</span>
                <span className="mt-0.5 block text-muted-foreground">The coach speaks every reply. Replies to voice messages are always read aloud.</span>
              </label>
              <Switch id="ai-autospeak" checked={preferences.autoSpeak} onCheckedChange={(autoSpeak) => update({ autoSpeak })} />
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function HelpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-xl rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LifeBuoy aria-hidden className="size-5 text-destructive" /> Get help now
          </SheetTitle>
          <SheetDescription>If you&apos;re in crisis or don&apos;t feel safe, reach out to a person right away. These are free and open 24/7.</SheetDescription>
        </SheetHeader>
        <ul className="grid gap-2 px-4">
          {CRISIS_LINES.map((line) => (
            <li key={line.id}>
              <a href={line.href} className="flex min-h-12 flex-col justify-center rounded-xl border bg-card px-3 py-2 text-sm shadow-soft hover:border-destructive/40">
                <span className="font-semibold">{line.label}</span>
                <span className="text-xs text-muted-foreground">{line.detail}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          The AI coach is a computer program, not a person, a doctor or a crisis counselor. It can make mistakes, so check important health information with a provider.
        </p>
      </SheetContent>
    </Sheet>
  );
}
