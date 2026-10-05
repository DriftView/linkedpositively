"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Clock, History, NotebookPen, PartyPopper, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { friendlyDate, shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { saveSession } from "../actions";
import { checklistProgress, normalizeAnswers, sameAnswers, type Answers } from "../answers";
import { getCurriculumSession, NO, SESSION_FOOTER, SESSION_START_KEY, YES } from "../curriculum";
import { methodLabel } from "../format";
import type { RunnerData } from "../types";
import { actionError } from "./action-result";
import { AutoTextarea } from "./auto-textarea";
import { ProgressRing, StatusPill } from "./bits";
import { ChecklistSectionCard, sectionAnchor, sectionTitle } from "./checklist";
import { MethodIcon, MethodPicker } from "./method-picker";
import { RevisionHistory } from "./revision-history";

type Draft = { answers: Answers; complete: boolean; noteText: string; noteMethod: string | null; baseRevisionId: string | null; at: string };

const TIME_RE = /^\d{2}:\d{2}$/;

/** Drafts as they were when the runner opened, so our own autosaves don't re-trigger the restore prompt. */
const initialDrafts = new Map<string, string | null>();
function readInitialDraft(key: string) {
  if (!initialDrafts.has(key)) {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {
      /* storage unavailable */
    }
    initialDrafts.set(key, value);
  }
  return initialDrafts.get(key) ?? null;
}
const noopSubscribe = () => () => {};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The session runner (legacy /load-session/{serial}-{uid}): the session's
 * checklist, timing and wrap-up questions, a contact note and the completion
 * toggle. Every Save stores a new revision. Unsaved work is kept on this
 * device as a draft, so a closed tab or lost connection doesn't lose it.
 */
export function SessionRunner({ data, timezone }: { data: RunnerData; timezone: string }) {
  const router = useRouter();
  const session = getCurriculumSession(data.serial)!;
  const draftKey = `pn-draft:${data.participant.id}:${data.serial}`;

  const [baseline, setBaseline] = useState({ answers: data.answers, complete: data.status === "complete" });
  const [answers, setAnswers] = useState<Answers>(data.answers);
  const [complete, setComplete] = useState(data.status === "complete");
  const [noteText, setNoteText] = useState("");
  const [noteMethod, setNoteMethod] = useState<string | null>(data.defaultMethod);
  const [methodError, setMethodError] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(data.latest?.createdAt ?? null);
  const [saving, startSaving] = useTransition();
  const [closeAfterSave, setCloseAfterSave] = useState(false);
  const methodRef = useRef<HTMLDivElement>(null);

  const dirty = !sameAnswers(answers, baseline.answers) || complete !== baseline.complete || noteText.trim() !== "";
  const progress = useMemo(() => checklistProgress(session, answers), [session, answers]);

  // Offer to restore a draft left on this device (read once per visit).
  const initialDraftRaw = useSyncExternalStore(noopSubscribe, () => readInitialDraft(draftKey), () => null);
  const [draftHandled, setDraftHandled] = useState(false);
  const pendingDraft = useMemo(() => {
    if (draftHandled || !initialDraftRaw) return null;
    try {
      const draft = JSON.parse(initialDraftRaw) as Draft;
      const differs = !sameAnswers(draft.answers, data.answers) || draft.complete !== (data.status === "complete") || Boolean(draft.noteText.trim());
      return differs ? draft : null;
    } catch {
      return null;
    }
  }, [draftHandled, initialDraftRaw, data.answers, data.status]);
  useEffect(() => () => void initialDrafts.delete(draftKey), [draftKey]);

  // Keep a draft while there are unsaved changes.
  useEffect(() => {
    if (!dirty || pendingDraft) return;
    const timer = window.setTimeout(() => {
      try {
        const draft: Draft = { answers, complete, noteText, noteMethod, baseRevisionId: data.latest?.id ?? null, at: new Date().toISOString() };
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* storage unavailable */
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [answers, complete, noteText, noteMethod, dirty, pendingDraft, draftKey, data.latest?.id]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const setAnswer = useCallback((key: string, value: boolean | string) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === false || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const save = useCallback(
    (close: boolean) => {
      if (noteText.trim() && !noteMethod) {
        setMethodError(true);
        methodRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        methodRef.current?.querySelector("button")?.focus();
        toast.error("Choose how you contacted them for the note.");
        return;
      }
      setCloseAfterSave(close);
      startSaving(async () => {
        const clean = normalizeAnswers(session, answers);
        const result = await saveSession({
          participantId: data.participant.id,
          serial: data.serial,
          answers: clean,
          complete,
          note: noteText.trim() ? { text: noteText.trim(), method: noteMethod as "voice" } : null,
        });
        const error = actionError(result);
        if (error || !result?.data) {
          toast.error(error ?? "We couldn't save the session.", { description: "Your changes are still here and kept on this device." });
          return;
        }
        const becameComplete = complete && !baseline.complete;
        setBaseline({ answers: clean, complete });
        setAnswers(clean);
        setNoteText("");
        setSavedAt(result.data.savedAt);
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
        setDraftHandled(true);
        if (becameComplete) toast.success(`Session ${data.serial} is complete`, { description: "Nice work. The participant will see it ticked off." });
        else toast.success("Session saved", { description: result.data.noteCreated ? "Your note was added too." : undefined });
        if (close) router.push(`/coach/${data.participant.id}/sessions`);
        else router.refresh();
      });
    },
    [answers, baseline.complete, complete, data.participant.id, data.serial, draftKey, noteMethod, noteText, router, session],
  );

  // Ctrl/⌘ + S saves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) save(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, saving]);

  function restoreDraft() {
    if (!pendingDraft) return;
    setAnswers(pendingDraft.answers);
    setComplete(pendingDraft.complete);
    setNoteText(pendingDraft.noteText);
    setNoteMethod(pendingDraft.noteMethod);
    setDraftHandled(true);
    toast("Draft restored", { description: "Save to keep these changes." });
  }
  function discardDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setDraftHandled(true);
  }

  const index = data.planOrder.indexOf(data.serial);
  const prevSerial = index > 0 ? data.planOrder[index - 1] : null;
  const nextSerial = index >= 0 && index < data.planOrder.length - 1 ? data.planOrder[index + 1] : null;
  const onSchedule = (answers[SESSION_FOOTER.onSchedule.key] as string | undefined) ?? "";
  const status = baseline.complete ? "complete" : data.status === "not_started" && !savedAt ? "not_started" : "in_progress";

  return (
    <div className="animate-rise">
      {/* Sticky action bar */}
      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b bg-background/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/coach/${data.participant.id}/sessions`}
            className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {data.participant.name}
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <SaveState dirty={dirty} saving={saving} savedAt={savedAt} timezone={timezone} />
            <Button variant="outline" size="lg" onClick={() => save(true)} disabled={saving} className="max-sm:hidden">
              {saving && closeAfterSave ? <Spinner /> : null}
              Save &amp; close
            </Button>
            <Button size="lg" onClick={() => save(false)} disabled={saving} className="min-w-20">
              {saving && !closeAfterSave ? <Spinner /> : <Check aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <header className="space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Session {data.serial} of 6</span>
              <StatusPill status={status} />
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">{session.title}</h1>
            <p className="text-sm text-muted-foreground">
              with <span className="font-medium text-foreground">{data.participant.name}</span>
              {data.participant.pronouns ? ` (${data.participant.pronouns})` : ""}
              {data.latest ? (
                <>
                  {" "}
                  · last saved {friendlyDate(data.latest.createdAt, timezone)}
                  {data.latest.coach ? ` by ${data.latest.coach.name}` : ""}
                </>
              ) : null}
            </p>
          </header>

          <AnimatePresence>
            {pendingDraft ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                role="status"
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-apricot/50 bg-brand-apricot/15 px-4 py-3 text-sm"
              >
                <Undo2 aria-hidden className="size-4 shrink-0" />
                <p className="min-w-0 flex-1">
                  You have unsaved changes from {shortAgo(pendingDraft.at, timezone)} on this device.
                  {pendingDraft.baseRevisionId !== (data.latest?.id ?? null) ? " The session has been saved since then, so check before saving." : ""}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={discardDraft}>
                    Discard
                  </Button>
                  <Button size="sm" onClick={restoreDraft}>
                    Restore
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Start time */}
          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <TimeField
              id="start-time"
              label="Start time"
              value={(answers[SESSION_START_KEY] as string | undefined) ?? ""}
              onChange={(v) => setAnswer(SESSION_START_KEY, v)}
            />
          </section>

          {session.sections.map((section, i) => (
            <ChecklistSectionCard key={section.title + i} section={section} index={i} answers={answers} onChange={setAnswer} />
          ))}

          {/* Wrap-up */}
          <section id="wrap-up" aria-labelledby="wrap-up-title" className="scroll-mt-32 space-y-5 rounded-2xl border bg-card p-5 shadow-soft">
            <h2 id="wrap-up-title" className="font-sans text-[0.95rem] font-semibold">
              Wrap-up
            </h2>
            <TimeField
              id="end-time"
              label="End time"
              value={(answers[SESSION_FOOTER.endTime.key] as string | undefined) ?? ""}
              onChange={(v) => setAnswer(SESSION_FOOTER.endTime.key, v)}
            />
            <YesNo
              id="q-schedule"
              label={SESSION_FOOTER.onSchedule.label}
              noLabel={session.rescheduledNoLabel}
              value={onSchedule}
              onChange={(v) => setAnswer(SESSION_FOOTER.onSchedule.key, v)}
            />
            <AnimatePresence initial={false}>
              {onSchedule === NO ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <label htmlFor="q-reason" className="mb-1.5 block text-sm font-medium">
                    {SESSION_FOOTER.rescheduleReason.label}
                  </label>
                  <Input
                    id="q-reason"
                    value={(answers[SESSION_FOOTER.rescheduleReason.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(SESSION_FOOTER.rescheduleReason.key, e.target.value)}
                    maxLength={1000}
                    className="h-10"
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
            <YesNo id="q-phone" label={SESSION_FOOTER.onPhone.label} value={(answers[SESSION_FOOTER.onPhone.key] as string) ?? ""} onChange={(v) => setAnswer(SESSION_FOOTER.onPhone.key, v)} />
            <YesNo id="q-video" label={SESSION_FOOTER.onVideo.label} value={(answers[SESSION_FOOTER.onVideo.key] as string) ?? ""} onChange={(v) => setAnswer(SESSION_FOOTER.onVideo.key, v)} />
          </section>

          {/* Notes */}
          <section id="notes" aria-labelledby="notes-title" className="scroll-mt-32 rounded-2xl border bg-card p-5 shadow-soft">
            <h2 id="notes-title" className="flex items-center gap-2 font-sans text-[0.95rem] font-semibold">
              <NotebookPen aria-hidden className="size-4 text-muted-foreground" />
              Notes
            </h2>
            {data.notes.length ? (
              <ul className="mt-3 space-y-2.5">
                {data.notes.map((note) => (
                  <li key={note.id} className="rounded-xl bg-muted/50 px-3.5 py-2.5">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{friendlyDate(note.createdAt, timezone)}</span>
                      {note.method ? (
                        <span className="inline-flex items-center gap-1">
                          <MethodIcon method={note.method} className="size-3.5" />
                          {methodLabel(note.method)}
                        </span>
                      ) : null}
                      {note.author ? <span>· {note.author.name}</span> : null}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{note.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No notes for this session yet.</p>
            )}
            <div className="mt-4 space-y-3">
              <label htmlFor="note-text" className="block text-sm font-medium">
                Add a note
                <span className="block text-[0.8rem] font-normal text-muted-foreground">
                  General information about today&apos;s session (e.g., What aspects worked well? What are the participant&apos;s strengths and barriers?)
                </span>
              </label>
              <AutoTextarea id="note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} minRows={3} maxLength={20000} />
              <div ref={methodRef}>
                <p id="note-method-label" className="mb-1.5 text-sm font-medium">
                  Method of contact
                </p>
                <MethodPicker
                  labelledBy="note-method-label"
                  value={noteMethod}
                  invalid={methodError && !noteMethod}
                  onChange={(v) => {
                    setNoteMethod(v);
                    setMethodError(false);
                  }}
                />
                {methodError && !noteMethod ? (
                  <p role="alert" className="mt-1.5 text-sm text-destructive">
                    Choose how you contacted them.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Completion */}
          <section
            className={cn(
              "flex items-start gap-4 rounded-2xl border p-5 shadow-soft transition-colors duration-500",
              complete ? "border-success/40 bg-success/8" : "bg-card",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl transition-all duration-500",
                complete ? "scale-105 bg-success text-success-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {complete ? <PartyPopper className="size-5" /> : <Check className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="complete" className="block text-[0.95rem] font-semibold">
                This session is complete
              </label>
              <p className="text-sm text-muted-foreground">
                {data.completedAt && baseline.complete
                  ? `Marked complete ${friendlyDate(data.completedAt, timezone)}. You can undo this if it was a mistake.`
                  : "The participant sees completed sessions ticked off on their plan. You can undo this later."}
              </p>
            </div>
            <Switch id="complete" checked={complete} onCheckedChange={setComplete} className="mt-1" />
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-10">
            <div className="flex gap-2">
              {prevSerial ? (
                <Button asChild variant="ghost" size="lg">
                  <Link href={`/coach/${data.participant.id}/sessions/${prevSerial}`}>
                    <ArrowLeft aria-hidden />
                    Previous session
                  </Link>
                </Button>
              ) : null}
              {nextSerial ? (
                <Button asChild variant="ghost" size="lg">
                  <Link href={`/coach/${data.participant.id}/sessions/${nextSerial}`}>
                    Next session
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={() => save(true)} disabled={saving}>
                Save &amp; close
              </Button>
              <Button size="lg" onClick={() => save(false)} disabled={saving}>
                {saving ? <Spinner /> : <Check aria-hidden />}
                Save session
              </Button>
            </div>
          </div>
        </div>

        {/* Outline rail */}
        <aside className="max-xl:hidden">
          <div className="sticky top-36 space-y-4">
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <ProgressRing value={progress.done} total={progress.total} size={44} stroke={4}>
                  <span className="text-[0.7rem] font-semibold tabular-nums">{Math.round((progress.done / progress.total) * 100)}%</span>
                </ProgressRing>
                <div>
                  <p className="text-sm font-semibold">Checklist</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {progress.done} of {progress.total} items
                  </p>
                </div>
              </div>
              <nav aria-label="Session sections" className="mt-4">
                <ol className="space-y-1">
                  {progress.sections.map((s, i) => (
                    <li key={s.title + i}>
                      <a
                        href={`#${sectionAnchor(i)}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.8rem] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0 flex-1 truncate">{sectionTitle(s.title)}</span>
                        <span className={cn("text-xs tabular-nums", s.done === s.total ? "text-success" : "text-muted-foreground")}>
                          {s.done === s.total ? <Check aria-label="done" className="size-3.5" /> : `${s.done}/${s.total}`}
                        </span>
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="#wrap-up" className="block rounded-lg px-2 py-1.5 text-[0.8rem] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                      Wrap-up
                    </a>
                  </li>
                  <li>
                    <a href="#notes" className="block rounded-lg px-2 py-1.5 text-[0.8rem] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                      Notes {data.notes.length ? <span className="text-muted-foreground">({data.notes.length})</span> : null}
                    </a>
                  </li>
                </ol>
              </nav>
            </div>
            <RevisionHistory
              participantId={data.participant.id}
              sections={session.sections}
              revisions={data.revisions}
              timezone={timezone}
              onRestore={(restored) => {
                setAnswers(restored);
                toast("Earlier version loaded", { description: "Save to keep it as the latest version." });
              }}
              trigger={
                <Button variant="outline" size="lg" className="w-full justify-start">
                  <History aria-hidden />
                  History
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{data.revisions.length}</span>
                </Button>
              }
            />
            <p className="px-1 text-xs text-muted-foreground">
              <Kbd>Ctrl</Kbd> <Kbd>S</Kbd> saves. Unsaved changes are kept on this device.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SaveState({ dirty, saving, savedAt, timezone }: { dirty: boolean; saving: boolean; savedAt: string | null; timezone: string }) {
  let text: string;
  if (saving) text = "Saving…";
  else if (dirty) text = "Unsaved changes";
  else if (savedAt) text = `Saved ${shortAgo(savedAt, timezone)}`;
  else text = "Not saved yet";
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground max-sm:hidden">
      <span aria-hidden className={cn("size-1.5 rounded-full", dirty ? "bg-brand-apricot" : "bg-success")} />
      {text}
    </span>
  );
}

function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  // Migrated sessions hold free text ("3pm"); keep those editable as text.
  const legacy = value !== "" && !TIME_RE.test(value);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <Clock aria-hidden className="size-4 text-muted-foreground" />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input id={id} type={legacy ? "text" : "time"} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-40" maxLength={40} />
        <Button type="button" variant="ghost" size="lg" onClick={() => onChange(nowHHMM())}>
          Now
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="lg" onClick={() => onChange("")} className="text-muted-foreground">
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function YesNo({ id, label, value, onChange, noLabel = "No" }: { id: string; label: string; value: string; onChange: (value: string) => void; noLabel?: string }) {
  return (
    <div>
      <p id={id} className="mb-1.5 text-sm font-medium">
        {label}
      </p>
      <ToggleGroup type="single" variant="outline" spacing={0} value={value} onValueChange={(v) => onChange(v)} aria-labelledby={id}>
        <ToggleGroupItem value={YES} className="h-9 min-w-16 px-4 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
          Yes
        </ToggleGroupItem>
        <ToggleGroupItem value={NO} className="h-9 min-w-16 px-4 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
          {noLabel.trim()}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
