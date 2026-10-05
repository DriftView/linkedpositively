"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/features/resources/lib";
import { actionError, fieldErrors } from "@/features/resources/client";
import { deletePageAction, savePageAction, type PageFormInput } from "../actions";
import { RichTextEditor } from "./rich-text-editor";

type Values = Required<Omit<PageFormInput, "id">>;

const EMPTY: Values = {
  title: "",
  slug: "",
  summary: "",
  bodyHtml: "",
  videoUrl: "",
  status: "draft",
  audience: "everyone",
  inMenu: true,
  order: 50,
  needsReview: false,
};

/** Create / edit an information page (Drupal public_page / page). */
export function PageEditor({ id, initial, aliases = [] }: { id?: string; initial?: Values; aliases?: string[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial ?? EMPTY);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await savePageAction({ ...values, id });
      setErrors(fieldErrors(result));
      const error = actionError(result);
      if (error || !result?.data) {
        toast.error(error ?? "Couldn't save the page.");
        return;
      }
      toast.success(id ? "Page saved" : "Page created");
      if (!id) router.push(`/admin/content/pages/${result.data.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!id) return;
    startTransition(async () => {
      const result = await deletePageAction({ id });
      const error = actionError(result);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Page deleted");
      router.push("/admin/content/pages");
    });
  }

  return (
    <form onSubmit={save} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="grid gap-5 rounded-xl border bg-card p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="page-title">Title</Label>
          <Input
            id="page-title"
            value={values.title}
            maxLength={160}
            required
            aria-invalid={Boolean(errors.title)}
            className="h-11 font-heading text-lg font-semibold"
            onChange={(event) => {
              const title = event.target.value;
              setValues((current) => ({ ...current, title, slug: slugTouched ? current.slug : slugify(title) }));
            }}
          />
          {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="page-slug">Address</Label>
          <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
            <span className="pl-2.5 text-sm text-muted-foreground">/pages/</span>
            <input
              id="page-slug"
              value={values.slug}
              maxLength={80}
              aria-invalid={Boolean(errors.slug)}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              className="h-8 min-w-0 flex-1 bg-transparent pr-2.5 text-sm outline-none"
            />
          </div>
          {errors.slug ? (
            <p className="text-sm text-destructive">{errors.slug}</p>
          ) : aliases.length ? (
            <p className="text-xs text-muted-foreground">Old addresses that still lead here: {aliases.map((alias) => `/${alias}`).join(", ")}</p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="page-summary">Summary</Label>
          <Textarea id="page-summary" value={values.summary} onChange={(event) => set("summary", event.target.value)} maxLength={300} rows={2} />
          <p className="text-xs text-muted-foreground">Shown under the title and on the Help &amp; info list.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="page-body">Content</Label>
          <RichTextEditor id="page-body" ariaLabel="Page content" value={values.bodyHtml} onChange={(html) => set("bodyHtml", html)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="page-video">Video (optional)</Label>
          <Input
            id="page-video"
            value={values.videoUrl}
            onChange={(event) => set("videoUrl", event.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-invalid={Boolean(errors.videoUrl)}
          />
          {errors.videoUrl ? <p className="text-sm text-destructive">{errors.videoUrl}</p> : <p className="text-xs text-muted-foreground">A YouTube or Vimeo link, shown above the content.</p>}
        </div>
      </div>

      <aside className="grid gap-4 lg:sticky lg:top-6">
        <div className="grid gap-4 rounded-xl border bg-card p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="page-status">Status</Label>
            <Select value={values.status} onValueChange={(value) => set("status", value as Values["status"])}>
              <SelectTrigger id="page-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft (staff only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="page-audience">Who can read it</Label>
            <Select value={values.audience} onValueChange={(value) => set("audience", value as Values["audience"])}>
              <SelectTrigger id="page-audience" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone who can sign in</SelectItem>
                <SelectItem value="staff">Content staff only (guides)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="page-menu">List on Help &amp; info</Label>
            <Switch id="page-menu" checked={values.inMenu} onCheckedChange={(value) => set("inMenu", value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="page-order">Order on the list</Label>
            <Input
              id="page-order"
              type="number"
              min={0}
              max={999}
              value={values.order}
              onChange={(event) => set("order", Math.max(0, Math.min(999, Number(event.target.value) || 0)))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="page-review" className="leading-snug">
              Copy needs review
            </Label>
            <Switch id="page-review" checked={values.needsReview} onCheckedChange={(value) => set("needsReview", value)} />
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner /> : <Save />}
            {id ? "Save changes" : "Create page"}
          </Button>
        </div>
        {id ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/pages/${initial?.slug ?? values.slug}`} target="_blank">
                <ExternalLink /> View page
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  <Trash2 /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{values.title}”?</AlertDialogTitle>
                  <AlertDialogDescription>Links to this page will stop working. To hide it for now, set it to Draft instead.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={remove}>
                    Delete page
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </aside>
    </form>
  );
}
