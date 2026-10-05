"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Link2, RotateCcw, Send, TriangleAlert, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/features/admin/components/bits";
import { runAction } from "@/features/admin/components/run-action";
import { cn } from "@/lib/utils";
import { resetTemplateAction, saveTemplateAction, sendTestAction } from "../actions";
import { DEFAULT_TEMPLATES, LINK_TARGETS, LINK_TOKEN, MEDIA_OPTIONS, renderSmsBody } from "../program";
import { smsSegments, straightenPunctuation } from "../segments";
import type { TemplateRow } from "../types";
import { flagLabel } from "./send-status";

type Draft = Pick<TemplateRow, "body" | "linkPath" | "mediaPath" | "active">;

function toDraft(row: TemplateRow): Draft {
  return { body: row.body, linkPath: row.linkPath, mediaPath: row.mediaPath, active: row.active };
}

function sameDraft(a: Draft, b: Draft) {
  return a.body === b.body && a.linkPath === b.linkPath && a.mediaPath === b.mediaPath && a.active === b.active;
}

export function TemplateEditor({ templates, appOrigin }: { templates: TemplateRow[]; appOrigin: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedKey = templates.some((row) => row.key === searchParams.get("m"))
    ? searchParams.get("m")!
    : templates[0].key;
  const current = templates.find((row) => row.key === selectedKey)!;
  const dirtyRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  function select(key: string) {
    if (key === selectedKey) return;
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes to this message?")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("m", key);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function onListKey(event: React.KeyboardEvent) {
    const index = templates.findIndex((row) => row.key === selectedKey);
    const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : null;
    if (next === null || next < 0 || next >= templates.length) return;
    event.preventDefault();
    select(templates[next].key);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-key="${templates[next].key}"]`)?.focus(),
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <MessageList
        templates={templates}
        selectedKey={selectedKey}
        listRef={listRef}
        onSelect={select}
        onKeyDown={onListKey}
      />
      <MessageEditor
        key={`${current.key}:${current.updatedAt}`}
        current={current}
        appOrigin={appOrigin}
        dirtyRef={dirtyRef}
      />
    </div>
  );
}

function MessageEditor({
  current,
  appOrigin,
  dirtyRef,
}: {
  current: TemplateRow;
  appOrigin: string;
  dirtyRef: React.RefObject<boolean>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(toDraft(current));
  const [pending, setPending] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const dirty = !sameDraft(draft, toDraft(current));
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);
  const original = DEFAULT_TEMPLATES.find((row) => row.key === current.key);
  const isOriginal = original ? sameDraft({ ...original, active: true }, draft) : true;
  const hasLink = draft.body.includes(LINK_TOKEN);
  const sampleUrl = `${appOrigin}/r/AbCdEfGhIjKlMnOpQrStUvWxYz0`;
  const preview = renderSmsBody(draft.body, hasLink ? sampleUrl : null);
  const segments = useMemo(() => smsSegments(preview), [preview]);
  const linkCount = (draft.body.match(/<link>/g) ?? []).length;

  async function save() {
    if (linkCount > 1) return;
    setPending(true);
    const data = await runAction(saveTemplateAction({ key: current.key, ...draft }), `${flagLabel(current.key)} saved`);
    setPending(false);
    if (data) router.refresh();
  }

  function insertLink() {
    const area = bodyRef.current;
    if (!area || hasLink) return;
    const start = area.selectionStart ?? draft.body.length;
    const before = draft.body.slice(0, start);
    const after = draft.body.slice(start);
    const spacer = before && !before.endsWith(" ") ? " " : "";
    setDraft({ ...draft, body: `${before}${spacer}${LINK_TOKEN}${after}`, linkPath: draft.linkPath || "/" });
    requestAnimationFrame(() => area.focus());
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (dirty && !pending) void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-soft sm:p-6" aria-labelledby="editor-heading">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="editor-heading" className="text-lg font-semibold">
              {current.week === 0 ? "Welcome text" : `Week ${current.week} text`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {current.week === 0
                ? "Sent 15 minutes after someone is converted to participant."
                : `Sent once on day ${current.week === 1 ? "2 or 3" : "1, 2 or 3"} of week ${current.week}, between 7 AM and 9 PM their time.`}
            </p>
          </div>
          <Field orientation="horizontal" className="w-auto">
            <Switch
              id="template-active"
              checked={draft.active}
              onCheckedChange={(value) => setDraft({ ...draft, active: value })}
            />
            <FieldLabel htmlFor="template-active" className="font-normal whitespace-nowrap">
              {draft.active ? "On" : "Off — skipped"}
            </FieldLabel>
          </Field>
        </div>

        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="template-body">Message</FieldLabel>
            <Button type="button" variant="ghost" size="xs" onClick={insertLink} disabled={hasLink}>
              <Link2 /> Insert link
            </Button>
          </div>
          <Textarea
            ref={bodyRef}
            id="template-body"
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            rows={5}
            className="min-h-32 text-[0.95rem] leading-relaxed"
            aria-invalid={linkCount > 1 || !draft.body.trim()}
            aria-describedby="template-meter"
          />
          <div
            id="template-meter"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span className="tabular-nums">{segments.units} characters with the link</span>
            <span className="tabular-nums">
              {segments.encoding} · {segments.segments} {segments.segments === 1 ? "segment" : "segments"}
              {draft.mediaPath ? " if sent without the image" : ""}
            </span>
            {linkCount > 1 ? <span className="text-destructive">Use {"<link>"} only once.</span> : null}
          </div>
          {segments.unicodeChars.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm">
              <TriangleAlert className="size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
              <span className="min-w-0 flex-1">
                {segments.unicodeChars.map((char) => (
                  <kbd key={char} className="mr-1 rounded bg-background px-1.5 py-0.5 font-sans text-xs ring-1 ring-border">
                    {char}
                  </kbd>
                ))}
                {segments.unicodeChars.length === 1 ? "makes" : "make"} this a Unicode text: 70 characters per segment instead of 160.
              </span>
              {straightenPunctuation(draft.body) !== draft.body ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setDraft({ ...draft, body: straightenPunctuation(draft.body) })}
                >
                  <Wand2 /> Use plain quotes
                </Button>
              ) : null}
            </div>
          ) : null}
        </Field>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="template-link">Link opens</FieldLabel>
            <Select
              value={draft.linkPath || "/"}
              onValueChange={(value) => setDraft({ ...draft, linkPath: value })}
              disabled={!hasLink}
            >
              <SelectTrigger id="template-link" className="w-full data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_TARGETS.map((target) => (
                  <SelectItem key={target.path} value={target.path}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {hasLink
                ? "Each person gets their own short link, so clicks are counted."
                : "Add <link> to the message to include a link."}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel id="template-image-label">Picture (MMS)</FieldLabel>
            <MediaPicker value={draft.mediaPath} onChange={(value) => setDraft({ ...draft, mediaPath: value })} />
            <FieldDescription>Sent as a picture message. Leave empty for a plain text.</FieldDescription>
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            {!isOriginal && original ? (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="sm">
                    <RotateCcw /> Restore original
                  </Button>
                }
                title="Restore the original text?"
                description={<p className="rounded-xl bg-muted p-3 text-foreground">{original.body}</p>}
                confirmLabel="Restore"
                onConfirm={async () => {
                  const data = await runAction(resetTemplateAction({ key: current.key }), "Original text restored");
                  if (!data) return false;
                  router.refresh();
                }}
              />
            ) : null}
            <TestSend draft={draft} />
          </div>
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(current))} disabled={pending}>
                Discard
              </Button>
            ) : null}
            <Button onClick={save} disabled={!dirty || pending || linkCount > 1 || !draft.body.trim()}>
              {pending ? <Spinner /> : null}
              Save <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground">Ctrl S</Kbd>
            </Button>
          </div>
        </div>
        {current.updatedBy ? (
          <p className="mt-3 text-right text-xs text-muted-foreground">Last edited by {current.updatedBy}</p>
        ) : null}
      </section>

      <aside aria-label="Preview" className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-start 2xl:sticky 2xl:top-20 2xl:block 2xl:self-start">
        <PhonePreview text={preview} mediaPath={draft.mediaPath} active={draft.active} />
        <dl className="grid grid-cols-3 gap-2 text-center 2xl:mt-4">
          {[
            ["Sent", current.sent],
            ["Opened", current.sent ? `${Math.round((current.clicked / current.sent) * 100)}%` : "—"],
            ["Upcoming", current.scheduled],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card px-2 py-2.5 shadow-soft">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-heading text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

function MessageList({
  templates,
  selectedKey,
  listRef,
  onSelect,
  onKeyDown,
}: {
  templates: TemplateRow[];
  selectedKey: string;
  listRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (key: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Program messages"
      onKeyDown={onKeyDown}
      className="max-h-[calc(100dvh-14rem)] overflow-y-auto rounded-2xl border bg-card p-1.5 shadow-soft lg:sticky lg:top-20"
    >
      {templates.map((row) => {
        const active = row.key === selectedKey;
        const rate = row.sent ? Math.round((row.clicked / row.sent) * 100) : null;
        return (
          <button
            key={row.key}
            data-key={row.key}
            role="option"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(row.key)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "bg-secondary text-secondary-foreground" : "hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {row.week === 0 ? "Hi" : row.week}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {flagLabel(row.key)}
                {!row.active ? (
                  <span className="rounded-full bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">
                    Off
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {row.sent
                  ? `${row.sent} sent · ${rate}% opened`
                  : row.scheduled
                    ? `${row.scheduled} scheduled`
                    : "Not sent yet"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MediaPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full justify-start gap-2 font-normal"
          aria-labelledby="template-image-label"
        >
          {value ? (
            <>
              <Image src={value} alt="" width={24} height={24} unoptimized className="size-6 rounded object-cover" />
              {value.replace("/sms/", "")}
            </>
          ) : (
            <>
              <ImageOff className="text-muted-foreground" /> No picture
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-2">
        <div className="grid max-h-80 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              !value && "ring-2 ring-primary",
            )}
          >
            <ImageOff className="size-4" /> None
          </button>
          {MEDIA_OPTIONS.map((path) => (
            <button
              key={path}
              type="button"
              title={path.replace("/sms/", "")}
              onClick={() => {
                onChange(path);
                setOpen(false);
              }}
              className={cn(
                "overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                value === path && "ring-2 ring-primary",
              )}
            >
              <Image
                src={path}
                alt={path.replace("/sms/", "")}
                width={80}
                height={80}
                unoptimized
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PhonePreview({ text, mediaPath, active }: { text: string; mediaPath: string; active: boolean }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <div className={cn("rounded-[2rem] border bg-muted/40 p-3 shadow-soft", !active && "opacity-60")}>
      <div className="rounded-[1.5rem] bg-background px-3 pt-3 pb-5">
        <p className="mb-3 text-center text-[0.7rem] text-muted-foreground">Text message · Preview</p>
        <div className="flex max-w-[88%] flex-col gap-1">
          {mediaPath ? (
            <Image
              src={mediaPath}
              alt=""
              width={240}
              height={240}
              unoptimized
              className="w-full rounded-2xl rounded-bl-md border object-cover"
            />
          ) : null}
          <p className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[0.9rem] leading-snug break-words whitespace-pre-wrap">
            {parts.map((part, index) =>
              /^https?:\/\//.test(part) ? (
                <span key={index} className="text-brand-sky underline underline-offset-2">
                  {part}
                </span>
              ) : (
                <span key={index}>{part}</span>
              ),
            )}
          </p>
        </div>
        {!active ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">This message is off and won&apos;t be sent.</p>
        ) : null}
      </div>
    </div>
  );
}

function TestSend({ draft }: { draft: Draft }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Send /> Send a test
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            const data = await runAction(sendTestAction({ to, ...draft }), "Test text sent");
            setPending(false);
            if (data) setOpen(false);
          }}
        >
          <Field>
            <FieldLabel htmlFor="test-to">Send this draft to</FieldLabel>
            <Input
              id="test-to"
              type="tel"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="+19879543210"
              autoFocus
            />
            <FieldDescription>The link in a test isn&apos;t tracked.</FieldDescription>
          </Field>
          <Button type="submit" size="sm" className="w-full" disabled={pending || !to.trim()}>
            {pending ? <Spinner /> : <Send />} Send test
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
