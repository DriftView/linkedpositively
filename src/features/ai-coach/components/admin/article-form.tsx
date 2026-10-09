"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/features/admin/components/run-action";
import { AI_TOPICS, type AiTopic } from "@/server/db/schema/ai";
import { deleteArticleAction, saveArticleAction } from "../../admin-actions";
import { articleFormSchema } from "../../schemas";
import type { ArticleFormDTO } from "../../types";
import { TOPIC_LABEL } from "./labels";

type Errors = Partial<Record<"title" | "body" | "sourceUrl" | "published", string>>;

export function ArticleForm({ article }: { article: ArticleFormDTO }) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [topic, setTopic] = useState<AiTopic>(article.topic);
  const [body, setBody] = useState(article.body);
  const [sourceUrl, setSourceUrl] = useState(article.sourceUrl);
  const [approved, setApproved] = useState(Boolean(article.id) && !article.needsReview);
  const [published, setPublished] = useState(article.published);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const input = { id: article.id, title, topic, body, sourceUrl, published, approved };
    const parsed = articleFormSchema.safeParse(input);
    const next: Errors = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[issue.path[0] as keyof Errors] ??= issue.message;
    if (published && !approved) next.published = "Tick “Approved by the study team” before publishing.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    const result = await runAction(saveArticleAction(parsed.data!), "Article saved");
    setPending(false);
    if (result?.id) {
      if (!article.id) router.replace(`/admin/ai/knowledge/${result.id}`);
      router.refresh();
    }
  }

  async function remove() {
    if (!article.id) return;
    setPending(true);
    const ok = await runAction(deleteArticleAction({ id: article.id }), "Article deleted");
    setPending(false);
    if (ok) router.push("/admin/ai/knowledge");
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft">
      <Field data-invalid={Boolean(errors.title)}>
        <FieldLabel htmlFor="a-title">Title</FieldLabel>
        <Input
          id="a-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9"
          placeholder="PEP: what to do after a possible exposure"
        />
        <FieldError>{errors.title}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="a-topic">Topic</FieldLabel>
        <select
          id="a-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value as AiTopic)}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm dark:bg-input/30"
        >
          {AI_TOPICS.map((value) => (
            <option key={value} value={value}>
              {TOPIC_LABEL[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field data-invalid={Boolean(errors.body)}>
        <FieldLabel htmlFor="a-body">Approved information</FieldLabel>
        <textarea
          id="a-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
        />
        {errors.body ? (
          <FieldError>{errors.body}</FieldError>
        ) : (
          <FieldDescription>
            Plain text; separate paragraphs with a blank line. The coach answers health questions only from approved
            content like this, so write the facts you want it to give, in plain language.
          </FieldDescription>
        )}
      </Field>
      <Field data-invalid={Boolean(errors.sourceUrl)}>
        <FieldLabel htmlFor="a-source">Source (for reviewers)</FieldLabel>
        <Input
          id="a-source"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="h-9"
          placeholder="https://www.cdc.gov/…"
        />
        <FieldError>{errors.sourceUrl}</FieldError>
      </Field>

      <div className="space-y-4 rounded-xl bg-muted/50 p-4">
        <label className="flex items-start justify-between gap-4 text-sm">
          <span>
            <span className="font-semibold">Approved by the study team</span>
            <span className="mt-0.5 block text-muted-foreground">
              {article.reviewedByName && approved ? `Approved by ${article.reviewedByName}. ` : ""}
              Ticking this records you as the reviewer.
            </span>
          </span>
          <Switch
            checked={approved}
            onCheckedChange={(value) => (setApproved(value), value ? null : setPublished(false))}
            aria-label="Approved by the study team"
          />
        </label>
        <label className="flex items-start justify-between gap-4 text-sm">
          <span>
            <span className="font-semibold">Published</span>
            <span className="mt-0.5 block text-muted-foreground">
              The coach uses published articles in its answers.
            </span>
            {errors.published ? <span className="mt-1 block text-destructive">{errors.published}</span> : null}
          </span>
          <Switch
            checked={published}
            onCheckedChange={(value) => {
              if (value && !approved) {
                toast.error("Approve the article before publishing it.");
                return;
              }
              setPublished(value);
            }}
            aria-label="Published"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          Save article
        </Button>
        {article.id ? (
          confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              Delete this article?
              <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={pending}>
                Delete
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )
        ) : null}
      </div>
    </form>
  );
}
