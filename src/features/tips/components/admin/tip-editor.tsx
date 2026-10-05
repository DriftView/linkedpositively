"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, FileUp, Link2, PlayCircle, Sparkles, Sprout, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { deleteTips, saveTip, uploadTipPdf } from "../../admin-actions";
import { tipInputSchema, type TipInput } from "../../schemas";
import { describeRule } from "../../tailoring";
import type { TipCardData } from "../../types";
import { videoEmbed } from "../../video";
import { TipCard } from "../tip-card";
import { RichTextEditor } from "./rich-text-editor";
import { TagPicker, type PickerTag } from "./tag-picker";

const TYPES = [
  { value: "html", label: "Text", icon: Sprout, hint: "A written tip" },
  { value: "video", label: "Video", icon: PlayCircle, hint: "YouTube or Vimeo" },
  { value: "pdf", label: "PDF", icon: FileText, hint: "A guide to download" },
  { value: "offsite", label: "Link", icon: Link2, hint: "Another website" },
] as const;

const TEMPLATES = [
  { value: "none", label: "Standard" },
  { value: "text_paragraph", label: "Text in paragraphs" },
  { value: "text_bullet", label: "Text with bullet points" },
  { value: "text_blockquote", label: "Pull quote first (block quote)" },
  { value: "text_linequote", label: "Pull quote first (line quote)" },
  { value: "image_text", label: "Image with text" },
  { value: "image_only", label: "Image only" },
  { value: "video_text", label: "Video with text" },
  { value: "video_only", label: "Video only" },
];

const SCORE_GROUPS = [
  { label: "Information (I)", fields: Array.from({ length: 9 }, (_, i) => `i${i + 1}`) },
  { label: "Motivation (M)", fields: Array.from({ length: 9 }, (_, i) => `m${i + 1}`) },
  { label: "Behavioural skills (B)", fields: Array.from({ length: 17 }, (_, i) => `b${i + 1}`) },
];
const OPERATORS = [
  { value: "<", label: "is below" },
  { value: "<=", label: "is at most" },
  { value: "==", label: "is exactly" },
  { value: "!=", label: "is not" },
  { value: ">=", label: "is at least" },
  { value: ">", label: "is above" },
] as const;

export const EMPTY_TIP: TipInput = {
  title: "",
  type: "html",
  template: null,
  html: "",
  description: "",
  pullquote: "",
  videoUrl: "",
  link: "",
  pdfKey: null,
  pdfName: null,
  tagIds: [],
  categoryId: null,
  displayDay: null,
  displayDayTwo: null,
  rule: null,
  published: true,
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Create / edit a Thrive Tip: type-dependent fields (like the old conditional
 * fields), rich text, topics, the two-cycle schedule, the tailoring rule and a
 * live participant preview.
 */
export function TipEditor({
  initial,
  tags: initialTags,
  categories,
  engagement,
}: {
  initial: TipInput & { id?: string };
  tags: PickerTag[];
  categories: PickerTag[];
  engagement?: { readers: number; views: number; recommended: number; favorites: number } | null;
}) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [previewRecommended, setPreviewRecommended] = useState(Boolean(initial.rule));
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<TipInput>({
    resolver: zodResolver(tipInputSchema),
    defaultValues: initial,
    mode: "onTouched",
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const errors = formState.errors;
  const values = useWatch({ control }) as TipInput;
  const type = values.type;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!formState.isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formState.isDirty]);

  function onSubmit(data: TipInput) {
    startSaving(async () => {
      const result = await saveTip({ ...data, id: initial.id });
      if (result?.serverError || result?.validationErrors || !result?.data) {
        toast.error(result?.serverError ?? "Please check the highlighted fields.");
        return;
      }
      form.reset(data);
      toast.success(initial.id ? "Tip saved" : "Tip created");
      if (!initial.id) router.replace(`/admin/content/tips/${result.data.id}`);
      else router.refresh();
    });
  }

  async function onPdf(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadTipPdf({ file });
      if (result?.serverError || !result?.data) return void toast.error(result?.serverError ?? "Upload failed.");
      setValue("pdfKey", result.data.key, { shouldDirty: true, shouldValidate: true });
      setValue("pdfName", result.data.name, { shouldDirty: true });
      toast.success("PDF uploaded");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onDelete() {
    if (!initial.id) return;
    startDeleting(async () => {
      const result = await deleteTips({ ids: [initial.id!] });
      if (result?.serverError) return void toast.error(result.serverError);
      form.reset(values);
      toast.success("Tip deleted");
      router.replace("/admin/content/tips");
    });
  }

  const video = values.videoUrl ? videoEmbed(values.videoUrl) : null;
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const preview: TipCardData = {
    id: initial.id ?? "000000000000000000000000",
    title: values.title || "Your tip title",
    type: values.type,
    template: values.template ?? null,
    html: values.html ?? "",
    description: values.description ?? "",
    pullquote: values.pullquote || null,
    video: values.videoUrl ? { url: values.videoUrl, embedUrl: video?.embedUrl ?? null, thumbnailUrl: video?.thumbnailUrl ?? null } : null,
    hasPdf: Boolean(values.pdfKey),
    pdfName: values.pdfName ?? null,
    link: values.link || null,
    tags: (values.tagIds ?? []).map((id) => ({ id, name: tagMap.get(id)?.name ?? "", slug: "" })).filter((t) => t.name),
    category: null,
    recommended: previewRecommended && Boolean(values.rule),
    favorited: false,
    isNew: true,
    releasedAt: null,
    studyDay: values.displayDay ?? null,
    excerpt: "",
    href: "#",
    canEarnPoints: false,
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-5">
        <Section title="Content">
          <div className="space-y-1.5">
            <Label htmlFor="tip-title">Title</Label>
            <Input id="tip-title" {...register("title")} aria-invalid={Boolean(errors.title)} className="h-10 text-base" placeholder="e.g. Pair your pills with something you already do" />
            <FieldError message={errors.title?.message} />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium" id="tip-type-label">
              Type
            </span>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div role="radiogroup" aria-labelledby="tip-type-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TYPES.map((t) => {
                    const checked = field.value === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => field.onChange(t.value)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          checked ? "border-primary bg-secondary" : "hover:bg-muted",
                        )}
                      >
                        <t.icon className={cn("size-5 shrink-0", checked ? "text-primary" : "text-muted-foreground")} />
                        <span>
                          <span className="block text-sm font-medium">{t.label}</span>
                          <span className="block text-xs text-muted-foreground">{t.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          {type !== "html" ? (
            <div className="space-y-1.5">
              <Label htmlFor="tip-description">Short description</Label>
              <Textarea id="tip-description" rows={3} {...register("description")} placeholder="One or two sentences about what they'll get from it." />
            </div>
          ) : null}

          {type === "video" ? (
            <div className="space-y-1.5">
              <Label htmlFor="tip-video">Video link</Label>
              <Input id="tip-video" {...register("videoUrl")} aria-invalid={Boolean(errors.videoUrl)} placeholder="https://www.youtube.com/watch?v=…" />
              {values.videoUrl && !video && !errors.videoUrl ? (
                <p className="text-sm text-warning-foreground dark:text-warning">We can only embed YouTube and Vimeo links; others open in a new tab.</p>
              ) : null}
              <FieldError message={errors.videoUrl?.message} />
            </div>
          ) : null}

          {type === "pdf" ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">PDF</span>
              {values.pdfKey ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                  <FileText className="size-5 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm">{values.pdfName ?? "Attached PDF"}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={uploading}>
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove PDF"
                    onClick={() => {
                      setValue("pdfKey", null, { shouldDirty: true });
                      setValue("pdfName", null, { shouldDirty: true });
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-muted/40",
                    errors.pdfKey && "border-destructive",
                  )}
                >
                  {uploading ? <Spinner /> : <FileUp className="size-6 text-primary" />}
                  {uploading ? "Uploading…" : "Choose a PDF (up to 8 MB)"}
                </button>
              )}
              <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPdf(e.target.files?.[0])} />
              <FieldError message={errors.pdfKey?.message} />
            </div>
          ) : null}

          {type === "offsite" ? (
            <div className="space-y-1.5">
              <Label htmlFor="tip-link">Link</Label>
              <Input id="tip-link" {...register("link")} aria-invalid={Boolean(errors.link)} placeholder="https://…" />
              <FieldError message={errors.link?.message} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <span id="tip-body-label" className="text-sm font-medium">
              {type === "html" ? "Tip" : "More detail (optional)"}
            </span>
            <Controller
              control={control}
              name="html"
              render={({ field }) => (
                <RichTextEditor
                  aria-labelledby="tip-body-label"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.html)}
                  placeholder="Keep it short, warm and practical. Lists work well on phones."
                />
              )}
            />
            <FieldError message={errors.html?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tip-quote">Pull quote (optional)</Label>
              <Textarea id="tip-quote" rows={2} {...register("pullquote")} placeholder="A line worth highlighting" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tip-template">Layout</Label>
              <Controller
                control={control}
                name="template"
                render={({ field }) => (
                  <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                    <SelectTrigger id="tip-template" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </Section>

        <Section title="Topics" description="Participants explore tips by topic, and related tips are matched on them.">
          <div className="space-y-1.5">
            <Label htmlFor="tip-topics">Topics</Label>
            <Controller
              control={control}
              name="tagIds"
              render={({ field }) => (
                <TagPicker
                  id="tip-topics"
                  tags={tags}
                  value={field.value}
                  onChange={field.onChange}
                  onCreated={(tag) => setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)))}
                  invalid={Boolean(errors.tagIds)}
                />
              )}
            />
            <FieldError message={errors.tagIds?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip-category">Category (optional)</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger id="tip-category" className="w-full [&>span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(36rem,90vw)]">
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </Section>

        <Section
          title="Schedule"
          description="Day 1 is the participant's study start date. The first 90 days use cycle 1; after that the tips come round again in the cycle 2 order."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {(["displayDay", "displayDayTwo"] as const).map((name, i) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={`tip-${name}`}>{i === 0 ? "Day in cycle 1" : "Day in cycle 2"}</Label>
                <Controller
                  control={control}
                  name={name}
                  render={({ field }) => (
                    <Input
                      id={`tip-${name}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={90}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      onBlur={field.onBlur}
                      aria-invalid={Boolean(errors[name])}
                      placeholder="1–90"
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {values[name]
                    ? `Released on study day ${i === 0 ? values[name] : 90 + (values[name] ?? 0)}.`
                    : i === 0
                      ? "Not scheduled: participants won't receive it."
                      : "Empty: uses the cycle 1 day."}
                </p>
                <FieldError message={errors[name]?.message} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tailoring" description="Recommend this tip to participants whose baseline survey score matches a rule. They see it highlighted and earn 5 points instead of 2.">
          <Controller
            control={control}
            name="rule"
            render={({ field }) => (
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={(on) => {
                      field.onChange(on ? { field: "b1", operator: "<", value: 3 } : null);
                      setPreviewRecommended(on);
                    }}
                  />
                  <span className="text-sm font-medium">Recommend to some participants</span>
                </label>
                {field.value ? (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span>When score</span>
                      <Select value={field.value.field} onValueChange={(v) => field.onChange({ ...field.value!, field: v })}>
                        <SelectTrigger className="w-24 bg-background" aria-label="Score">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {SCORE_GROUPS.map((group) => (
                            <SelectGroup key={group.label}>
                              <SelectLabel>{group.label}</SelectLabel>
                              {group.fields.map((f) => (
                                <SelectItem key={f} value={f}>
                                  {f.toUpperCase()}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={field.value.operator} onValueChange={(v) => field.onChange({ ...field.value!, operator: v })}>
                        <SelectTrigger className="w-32 bg-background" aria-label="Comparison">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        aria-label="Value"
                        className="w-20 bg-background"
                        value={Number.isFinite(field.value.value) ? field.value.value : ""}
                        onChange={(e) => field.onChange({ ...field.value!, value: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                      />
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Sparkles className="size-4 text-brand-apricot" />
                      Recommended when {describeRule(field.value)}. Participants without this score don&apos;t see it as recommended.
                    </p>
                    <FieldError message={errors.rule?.value?.message ?? errors.rule?.message} />
                  </div>
                ) : null}
              </div>
            )}
          />
        </Section>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-xl border bg-card p-5 shadow-soft">
          <Controller
            control={control}
            name="published"
            render={({ field }) => (
              <label className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium">{field.value ? "Published" : "Hidden"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {field.value ? "Participants receive it on its day." : "Only staff can see it."}
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          <div className="mt-4 flex gap-2">
            <Button type="submit" className="flex-1" size="lg" disabled={saving || uploading}>
              {saving ? <Spinner /> : null}
              {initial.id ? "Save changes" : "Create tip"}
            </Button>
            <Button type="button" variant="outline" size="lg" asChild>
              <Link href="/admin/content/tips">Cancel</Link>
            </Button>
          </div>
          {formState.isDirty ? <p className="mt-2 text-xs text-muted-foreground">You have unsaved changes.</p> : null}
          {engagement ? (
            <dl className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
              {[
                ["Readers", engagement.readers],
                ["Opens", engagement.views],
                ["Favourites", engagement.favorites],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Participant preview</h2>
            {values.rule ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch size="sm" checked={previewRecommended} onCheckedChange={setPreviewRecommended} /> As recommended
              </label>
            ) : null}
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="pointer-events-none select-none">
              <TipCard tip={preview} showFavorite={false} />
            </div>
          </div>
        </div>

        {initial.id ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" className="w-full" disabled={deleting}>
                <Trash2 /> Delete tip
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this tip?</AlertDialogTitle>
                <AlertDialogDescription>
                  Participants will no longer see it and favourites are removed. Reading history stays in the reports. You can hide it instead if you
                  might want it back.
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
