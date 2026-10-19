"use client";

import { useState } from "react";
import { Check, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { saveCoachDesignAction } from "../actions";
import {
  COACHES,
  coachVoice,
  LENGTH_OPTIONS,
  PRONOUN_OPTIONS,
  resolveCoach,
  TONE_OPTIONS,
  VOICE_PREVIEW_TEXT,
  type Coach,
  type CoachDesign,
} from "../coach-design";
import { CoachPortrait } from "./coach-portrait";
import { useCoachVoice } from "./use-coach-voice";

type Choice<T extends string> = { id: T; label: string; hint?: string };

/** A row of radio chips. */
function Choices<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                "min-h-9 max-w-full rounded-full border px-3 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                selected && "border-primary bg-secondary font-medium",
              )}
            >
              {option.label}
              {option.hint ? (
                <span className="block text-xs font-normal text-muted-foreground">{option.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * "Choose your coach": pick one of the fixed coaches (each with its own name,
 * voice and face; hear each voice first), then how it talks. Members choose,
 * they don't design: the coach and its safety rules stay the same.
 * Mount with a new `key` each time it opens so it starts from the saved choice.
 */
export function CoachPicker({
  open,
  onOpenChange,
  design,
  onSaved,
  voiceEnabled,
  realistic,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  design: CoachDesign;
  onSaved: (design: CoachDesign) => void;
  voiceEnabled: boolean;
  /** The video coach is available: show each coach's photo. */
  realistic: boolean;
}) {
  const [draft, setDraft] = useState(design);
  const [saving, setSaving] = useState(false);
  const coach = resolveCoach(draft);
  const voice = useCoachVoice({ pitch: coachVoice(coach.voice).pitch });

  function preview(option: Coach) {
    const id = `preview-${option.id}`;
    if (voice.speakingId === id || voice.loadingId === id) {
      voice.stop();
      return;
    }
    voice.unlock();
    void voice.speak(id, VOICE_PREVIEW_TEXT, { preview: option.voice });
  }

  async function save() {
    setSaving(true);
    const result = await saveCoachDesignAction(draft);
    setSaving(false);
    if (result?.serverError || result?.validationErrors) {
      toast.error(result.serverError ?? "That didn't save. Please try again.");
      return;
    }
    voice.stop();
    onSaved(draft);
    onOpenChange(false);
    toast.success(`${coach.name} is your coach`);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) voice.stop();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="gap-0 data-[side=right]:w-[min(28rem,96vw)] data-[side=right]:sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Choose your coach</SheetTitle>
          <SheetDescription>
            Pick who you&apos;d like to talk to. Every coach is an AI coach with the same safety rules.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto border-t px-4 py-4">
          <fieldset>
            <legend className="sr-only">Coach</legend>
            <ul role="radiogroup" aria-label="Coach" className="grid grid-cols-2 gap-3">
              {COACHES.map((option) => {
                const selected = draft.coachId === option.id;
                const id = `preview-${option.id}`;
                return (
                  <li
                    key={option.id}
                    className={cn(
                      "relative flex min-w-0 flex-col items-center rounded-2xl border p-3 text-center transition-colors",
                      selected && "border-primary bg-secondary",
                    )}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDraft((current) => ({ ...current, coachId: option.id }))}
                      className="flex w-full min-w-0 flex-col items-center gap-2 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <CoachPortrait
                        coach={option}
                        realistic={realistic}
                        state={voice.speakingId === id ? "speaking" : "idle"}
                        face={voice.face}
                        size={128}
                        still={voice.speakingId !== id}
                        className="h-auto w-full max-w-32"
                      />
                      <span className="w-full truncate font-semibold">{option.name}</span>
                      <span className="-mt-2 text-xs text-muted-foreground">
                        {PRONOUN_OPTIONS.find((pronouns) => pronouns.id === option.pronouns)?.label}
                      </span>
                    </button>
                    {selected ? <Check aria-hidden className="absolute top-2 right-2 size-4 text-primary" /> : null}
                    {voiceEnabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-9 rounded-full"
                        aria-label={`Hear ${option.name}'s voice`}
                        onClick={() => preview(option)}
                      >
                        {voice.loadingId === id ? (
                          <Spinner />
                        ) : voice.speakingId === id ? (
                          <Square aria-hidden />
                        ) : (
                          <Play aria-hidden />
                        )}
                        Hear
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">More coaches are on the way.</p>
          </fieldset>

          <section className="space-y-4" aria-labelledby="picker-style">
            <h3 id="picker-style" className="text-sm font-semibold">
              How {coach.name} talks
            </h3>
            <Choices
              legend="Tone"
              options={TONE_OPTIONS}
              value={draft.tone}
              onChange={(tone) => setDraft((current) => ({ ...current, tone }))}
            />
            <Choices
              legend="Reply length"
              options={LENGTH_OPTIONS}
              value={draft.replyLength}
              onChange={(replyLength) => setDraft((current) => ({ ...current, replyLength }))}
            />
            <p className="text-xs text-muted-foreground">
              If you might be in danger, your coach always keeps it short and points you to help, whatever the style.
            </p>
          </section>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
