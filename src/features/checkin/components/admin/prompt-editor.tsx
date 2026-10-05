"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pill, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/features/tips/components/admin/rich-text-editor";
import { cn } from "@/lib/utils";
import { deletePrompt, savePrompt } from "../../admin-actions";
import { promptInputSchema, type PromptInput } from "../../schemas";

const BANDS = [
  { key: "feedbackLow", label: "Low (answers 1–2)" },
  { key: "feedbackMedium", label: "Middle (answer 3)" },
  { key: "feedbackHigh", label: "High (answers 4–5)" },
] as const;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Err({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

/** Edit one slot of the 10-week prompt rotation, with a live participant preview. */
export function PromptEditor({ initial, exists }: { initial: PromptInput; exists: boolean }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [band, setBand] = useState<(typeof BANDS)[number]["key"]>("feedbackHigh");
  const form = useForm<PromptInput>({ resolver: zodResolver(promptInputSchema), defaultValues: initial, mode: "onTouched" });
  const { register, control, handleSubmit, formState } = form;
  const { fields } = useFieldArray({ control, name: "likertOptions" });
  const values = useWatch({ control }) as PromptInput;
  const errors = formState.errors;

  useEffect(() => {
    if (!formState.isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formState.isDirty]);

  function onSubmit(data: PromptInput) {
    startSaving(async () => {
      const result = await savePrompt(data);
      if (result?.serverError || result?.validationErrors) return void toast.error(result?.serverError ?? "Please check the highlighted fields.");
      form.reset(data);
      toast.success(`Week ${data.sequence} prompt saved`);
      router.refresh();
    });
  }

  function onDelete() {
    startDeleting(async () => {
      const result = await deletePrompt({ sequence: initial.sequence });
      if (result?.serverError) return void toast.error(result.serverError);
      form.reset(values);
      toast.success("Prompt deleted");
      router.replace("/admin/content/check-in");
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-5">
        <Section title="About this prompt">
          <div className="space-y-1.5">
            <Label htmlFor="p-title">Name (staff only)</Label>
            <Input id="p-title" {...register("title")} aria-invalid={Boolean(errors.title)} />
            <Err message={errors.title?.message} />
          </div>
        </Section>

        <Section title="Question 1 · rating" description="Answers are scored 1 to 5; the score picks the feedback below.">
          <div className="space-y-1.5">
            <Label htmlFor="p-likert">Question</Label>
            <Textarea id="p-likert" rows={2} {...register("likertText")} aria-invalid={Boolean(errors.likertText)} />
            <Err message={errors.likertText?.message} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">Answers</legend>
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <Input
                  {...register(`likertOptions.${i}.label`)}
                  aria-label={`Answer scored ${i + 1}`}
                  aria-invalid={Boolean(errors.likertOptions?.[i]?.label)}
                  placeholder={i === 0 ? "Lowest" : i === 4 ? "Highest" : ""}
                />
              </div>
            ))}
            <Err message={errors.likertOptions?.message ?? errors.likertOptions?.find?.((e) => e?.label)?.label?.message} />
          </fieldset>
        </Section>

        <Section title="Question 2 · open" description="Participants can skip it.">
          <div className="space-y-1.5">
            <Label htmlFor="p-open">Question</Label>
            <Textarea id="p-open" rows={2} {...register("openText")} aria-invalid={Boolean(errors.openText)} />
            <Err message={errors.openText?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-placeholder">Hint inside the box</Label>
            <Input id="p-placeholder" {...register("openPlaceholder")} />
          </div>
        </Section>

        <Section title="Feedback" description="Shown after they finish, based on their rating.">
          <div role="tablist" aria-label="Feedback band" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {BANDS.map((b) => (
              <button
                key={b.key}
                type="button"
                role="tab"
                aria-selected={band === b.key}
                onClick={() => setBand(b.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  band === b.key ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground",
                  !(values[b.key] ?? "").replace(/<[^>]*>/g, "").trim() && "italic",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
          {BANDS.map((b) => (
            <div key={b.key} role="tabpanel" hidden={band !== b.key}>
              <Controller
                control={control}
                name={b.key}
                render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} placeholder="Warm, specific encouragement…" />}
              />
            </div>
          ))}
        </Section>

        <Section
          title="Medication feedback"
          description="Added from the second prompt of the rotation on, depending on whether every day of the week had a dose logged."
        >
          <div className="space-y-1.5">
            <Label htmlFor="p-more">When they took their meds all 7 days</Label>
            <Textarea id="p-more" rows={2} {...register("moreAdherentFeedback")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-less">When a day was missed or not logged</Label>
            <Textarea id="p-less" rows={2} {...register("lessAdherentFeedback")} />
          </div>
        </Section>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-xl border bg-card p-5 shadow-soft">
          <p className="text-sm text-muted-foreground">
            Used in weeks {values.sequence}, {values.sequence + 10}, {values.sequence + 20}… of each participant&apos;s study.
          </p>
          <div className="mt-4 flex gap-2">
            <Button type="submit" size="lg" className="flex-1" disabled={saving}>
              {saving ? <Spinner /> : null} {exists ? "Save changes" : "Create prompt"}
            </Button>
            <Button type="button" size="lg" variant="outline" asChild>
              <Link href="/admin/content/check-in">Cancel</Link>
            </Button>
          </div>
          {formState.isDirty ? <p className="mt-2 text-xs text-muted-foreground">You have unsaved changes.</p> : null}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Participant preview</h2>
          <div className="space-y-3 rounded-xl bg-muted/50 p-3">
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <p className="font-heading text-base leading-snug font-semibold">{values.likertText || "Your rating question"}</p>
              <ul className="mt-3 space-y-1.5">
                {values.likertOptions?.map((o, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
                    <span className="size-4 rounded-full border-2 border-muted-foreground/40" aria-hidden />
                    {o.label || <span className="text-muted-foreground">Answer {i + 1}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 font-heading text-sm font-semibold">{values.openText || "Your open question"}</p>
              <div className="mt-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">{values.openPlaceholder || "Write as much or as little as you like."}</div>
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <p className="text-center font-heading text-lg font-semibold">Thanks!</p>
              <div
                className="prose-content mt-2 text-sm"
                dangerouslySetInnerHTML={{ __html: values[band] || "<p><em>No feedback written for this band yet.</em></p>" }}
              />
              {values.sequence !== 1 && values.moreAdherentFeedback ? (
                <p className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                  <Pill className="mt-0.5 size-4 shrink-0 text-primary" /> {values.moreAdherentFeedback}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {exists ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" className="w-full" disabled={deleting}>
                <Trash2 /> Delete prompt
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete the week {initial.sequence} prompt?</AlertDialogTitle>
                <AlertDialogDescription>
                  Participants whose check-in uses this slot will see “This week&apos;s questions aren&apos;t ready yet” until you create a new one.
                  Answers already given keep a copy of the questions.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-white hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </aside>
    </form>
  );
}
