"use client";

import { useState } from "react";
import { Check, Play, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import type { AiCoachAppearance } from "@/server/db/schema/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { saveCoachDesignAction } from "../actions";
import {
  COACH_NAME_PATTERN,
  COACH_PRESETS,
  COACH_VOICES,
  coachVoice,
  EARRINGS,
  FACIAL_HAIR,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  LENGTH_OPTIONS,
  OUTFIT_COLORS,
  OUTFITS,
  PRONOUN_OPTIONS,
  resolveCoach,
  SKIN_TONES,
  TONE_OPTIONS,
  VOICE_PREVIEW_TEXT,
  type CoachDesign,
} from "../coach-design";
import { CoachAvatar } from "./coach-avatar";
import { useCoachVoice } from "./use-coach-voice";

type Choice<T extends string> = { id: T; label: string; hint?: string; swatch?: string };

/** A row of radio chips (or color swatches when every option has a `swatch`). */
function Choices<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const swatches = options.every((option) => option.swatch);
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.id === value;
          return swatches ? (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.id)}
              className={cn(
                "grid size-9 place-items-center rounded-full border-2 border-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected && "border-primary",
              )}
            >
              <span className="size-7 rounded-full border border-black/10" style={{ background: option.swatch }} />
            </button>
          ) : (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
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
 * "Design your coach": pick a starting look, then change its name, pronouns,
 * appearance, voice and style, with a live preview that can speak each voice.
 * Fixed choices only; the design never changes the coach's safety rules.
 * Mount with a new `key` each time it opens so it starts from the saved design.
 */
export function CoachDesigner({
  open,
  onOpenChange,
  design,
  onSaved,
  voiceEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  design: CoachDesign;
  onSaved: (design: CoachDesign) => void;
  voiceEnabled: boolean;
}) {
  const [draft, setDraft] = useState(design);
  const [saving, setSaving] = useState(false);
  const coach = resolveCoach(draft);
  const voice = useCoachVoice({ pitch: coachVoice(coach.voice).pitch });
  const nameInvalid = Boolean(draft.name?.trim()) && !COACH_NAME_PATTERN.test(draft.name!.trim());

  const setLook = <K extends keyof AiCoachAppearance>(key: K, value: AiCoachAppearance[K]) =>
    setDraft((current) => ({ ...current, appearance: { ...resolveCoach(current).appearance, [key]: value } }));

  function preview(id: CoachDesign["voice"] & string) {
    setDraft((current) => ({ ...current, voice: id }));
    if (voice.speakingId === `preview-${id}` || voice.loadingId === `preview-${id}`) {
      voice.stop();
      return;
    }
    voice.unlock();
    void voice.speak(`preview-${id}`, VOICE_PREVIEW_TEXT, { preview: id });
  }

  async function save() {
    if (nameInvalid) return;
    setSaving(true);
    const next = { ...draft, name: draft.name?.trim() || null };
    const result = await saveCoachDesignAction(next);
    setSaving(false);
    if (result?.serverError || result?.validationErrors) {
      toast.error(result.serverError ?? "Check your coach's name and try again.");
      return;
    }
    voice.stop();
    onSaved(next);
    onOpenChange(false);
    toast.success(`${coach.name} is ready`);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) voice.stop();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-[min(28rem,96vw)] gap-0">
        <SheetHeader>
          <SheetTitle>Design your coach</SheetTitle>
          <SheetDescription>
            Choose how your coach looks, sounds and talks. It&apos;s still an AI coach with the same safety rules.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-4 border-y bg-muted/40 px-4 py-3">
          <CoachAvatar
            appearance={coach.appearance}
            name={coach.name}
            state={voice.speakingId ? "speaking" : "idle"}
            face={voice.face}
            size={112}
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{coach.name}</p>
            <p className="text-sm text-muted-foreground">
              {PRONOUN_OPTIONS.find((option) => option.id === coach.pronouns)?.label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {TONE_OPTIONS.find((option) => option.id === coach.tone)?.label} ·{" "}
              {LENGTH_OPTIONS.find((option) => option.id === coach.replyLength)?.label} replies
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Start from</legend>
            <div role="radiogroup" aria-label="Start from" className="grid grid-cols-4 gap-2">
              {COACH_PRESETS.map((preset) => {
                const selected =
                  draft.look === preset.id && !draft.appearance && !draft.name && !draft.voice && !draft.pronouns;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        look: preset.id,
                        name: null,
                        pronouns: null,
                        appearance: null,
                        voice: null,
                      }))
                    }
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-xl border p-1.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected && "border-primary bg-secondary",
                    )}
                  >
                    <CoachAvatar appearance={preset.appearance} name={preset.name} state="idle" size={56} still />
                    {preset.name}
                    {selected ? <Check aria-hidden className="absolute top-1 right-1 size-3.5 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <section className="space-y-4" aria-labelledby="designer-name">
            <h3 id="designer-name" className="text-sm font-semibold">
              Name and pronouns
            </h3>
            <div>
              <label htmlFor="coach-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <Input
                id="coach-name"
                value={draft.name ?? ""}
                placeholder={COACH_PRESETS.find((preset) => preset.id === draft.look)?.name}
                maxLength={20}
                autoComplete="off"
                aria-invalid={nameInvalid}
                aria-describedby="coach-name-hint"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className="h-10"
              />
              <p
                id="coach-name-hint"
                className={cn("mt-1 text-xs text-muted-foreground", nameInvalid && "text-destructive")}
              >
                {nameInvalid ? "Use letters and spaces only." : "Up to 20 letters."}
              </p>
            </div>
            <Choices
              legend="Pronouns"
              options={PRONOUN_OPTIONS}
              value={coach.pronouns}
              onChange={(pronouns) => setDraft((current) => ({ ...current, pronouns }))}
            />
          </section>

          <section className="space-y-4" aria-labelledby="designer-look">
            <h3 id="designer-look" className="text-sm font-semibold">
              Look
            </h3>
            <Choices
              legend="Skin tone"
              options={Object.entries(SKIN_TONES).map(([id, tone]) => ({
                id: id as AiCoachAppearance["skin"],
                label: tone.label,
                swatch: tone.base,
              }))}
              value={coach.appearance.skin}
              onChange={(value) => setLook("skin", value)}
            />
            <Choices
              legend="Hair"
              options={HAIR_STYLES}
              value={coach.appearance.hair}
              onChange={(value) => setLook("hair", value)}
            />
            <Choices
              legend={coach.appearance.hair === "hijab" ? "Hijab color" : "Hair color"}
              options={Object.entries(HAIR_COLORS).map(([id, color]) => ({
                id: id as AiCoachAppearance["hairColor"],
                label: color.label,
                swatch: color.color,
              }))}
              value={coach.appearance.hairColor}
              onChange={(value) => setLook("hairColor", value)}
            />
            <Choices
              legend="Facial hair"
              options={FACIAL_HAIR}
              value={coach.appearance.facialHair}
              onChange={(value) => setLook("facialHair", value)}
            />
            <Choices
              legend="Glasses"
              options={GLASSES}
              value={coach.appearance.glasses}
              onChange={(value) => setLook("glasses", value)}
            />
            {coach.appearance.hair === "hijab" ? null : (
              <Choices
                legend="Earrings"
                options={EARRINGS}
                value={coach.appearance.earrings}
                onChange={(value) => setLook("earrings", value)}
              />
            )}
            <Choices
              legend="Top"
              options={OUTFITS}
              value={coach.appearance.outfit}
              onChange={(value) => setLook("outfit", value)}
            />
            <Choices
              legend="Top color"
              options={Object.entries(OUTFIT_COLORS).map(([id, color]) => ({
                id: id as AiCoachAppearance["outfitColor"],
                label: color.label,
                swatch: color.color,
              }))}
              value={coach.appearance.outfitColor}
              onChange={(value) => setLook("outfitColor", value)}
            />
          </section>

          {voiceEnabled ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Voice</legend>
              <ul role="radiogroup" aria-label="Voice" className="grid gap-1.5">
                {COACH_VOICES.map((option) => {
                  const selected = coach.voice === option.id;
                  const id = `preview-${option.id}`;
                  return (
                    <li
                      key={option.id}
                      className={cn(
                        "flex items-center gap-1 rounded-xl border",
                        selected && "border-primary bg-secondary",
                      )}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setDraft((current) => ({ ...current, voice: option.id }))}
                        className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {selected ? <Check aria-hidden className="size-4 text-primary" /> : <span className="size-4" />}
                        {option.label}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className="size-10"
                        aria-label={`Hear the ${option.label.toLowerCase()} voice`}
                        onClick={() => preview(option.id)}
                      >
                        {voice.loadingId === id ? (
                          <Spinner />
                        ) : voice.speakingId === id ? (
                          <Square aria-hidden />
                        ) : (
                          <Play aria-hidden />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          <section className="space-y-4" aria-labelledby="designer-style">
            <h3 id="designer-style" className="text-sm font-semibold">
              How it talks
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

        <SheetFooter className="flex-row items-center justify-between border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                name: null,
                pronouns: null,
                appearance: null,
                voice: null,
                tone: "warm",
                replyLength: "balanced",
              }))
            }
          >
            <RotateCcw aria-hidden /> Reset
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || nameInvalid}>
              {saving ? <Spinner /> : null}
              Save coach
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
