"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CircleCheck, CloudOff, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { DateText, TimeAgo } from "@/features/admin/components/bits";
import { DataTable, type AdminColumn } from "@/features/admin/components/data-table";
import { runAction } from "@/features/admin/components/run-action";
import { runSyncAction, saveSurveyAction } from "../actions";
import type { SurveyAdminData, SurveyResponseRow } from "../queries";

type Survey = SurveyAdminData["surveys"][number];

const SYNC_LABEL = { off: "Not imported", create_users: "Creates control accounts", update_users: "Marks people as done" } as const;
const TARGETS = [
  { value: "studyId", label: "Study ID" },
  { value: "username", label: "Username" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "extra", label: "Keep answer" },
] as const;

export function SurveyCards({ surveys, timezone, connected }: { surveys: Survey[]; timezone: string; connected: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {surveys.map((survey) => (
        <article key={survey.key} className="flex flex-col rounded-2xl border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">{survey.title}</h3>
              <p className="text-xs text-muted-foreground">{survey.qualtricsSurveyId || "No Qualtrics survey ID"}</p>
            </div>
            <SurveyDialog survey={survey} />
          </div>
          <p className="mt-4 font-heading text-3xl font-semibold tabular-nums">{survey.completed}</p>
          <p className="text-sm text-muted-foreground">{survey.key === "baseline" ? "responses imported" : "people finished it"}</p>
          <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">In-app reminder</dt>
              <dd>{survey.promptEnabled ? `Weeks ${survey.openWeek}–${survey.closeWeek}` : "Off"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Import</dt>
              <dd>{connected ? SYNC_LABEL[survey.syncMode] : survey.syncMode === "off" ? "Off" : "Waiting for Qualtrics"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last import</dt>
              <dd>{survey.lastSyncedAt ? <TimeAgo date={survey.lastSyncedAt} timezone={timezone} /> : "Never"}</dd>
            </div>
          </dl>
          {survey.lastSyncError ? <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">Last import failed: {survey.lastSyncError}</p> : null}
          {survey.url ? (
            <a href={survey.url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm text-primary hover:underline">
              Open the form <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <p className="mt-auto pt-4 text-sm text-muted-foreground">No participant link yet</p>
          )}
        </article>
      ))}
    </div>
  );
}

function SurveyDialog({ survey }: { survey: Survey }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(survey);
  const [error, setError] = useState<{ path: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveSurveyAction({
      key: form.key,
      title: form.title,
      url: form.url.trim(),
      qualtricsSurveyId: form.qualtricsSurveyId.trim(),
      syncMode: form.syncMode,
      promptEnabled: form.promptEnabled,
      openWeek: Number(form.openWeek),
      closeWeek: Number(form.closeWeek),
      fieldMap: form.fieldMap.filter((entry) => entry.source.trim()),
    });
    setPending(false);
    const issues = result?.validationErrors as Record<string, { _errors?: string[] }> | undefined;
    if (issues) {
      const [path, value] = Object.entries(issues).find(([, value]) => value?._errors?.length) ?? ["", { _errors: ["Please check the form."] }];
      setError({ path, message: value?._errors?.[0] ?? "Please check the form." });
      return;
    }
    const data = await runAction(Promise.resolve(result), `${form.title} saved`);
    if (data) {
      setOpen(false);
      router.refresh();
    }
  }

  const err = (path: string) => (error?.path === path ? error.message : null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) {
          setForm(survey);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${survey.title}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{survey.title}</DialogTitle>
          <DialogDescription>The participant link gets their study ID added as ?ID=… so responses can be matched.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sv-title">Name</FieldLabel>
            <Input id="sv-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9" />
            <FieldError>{err("title")}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="sv-id">Qualtrics survey ID</FieldLabel>
            <Input id="sv-id" value={form.qualtricsSurveyId} onChange={(e) => setForm({ ...form, qualtricsSurveyId: e.target.value })} className="h-9" placeholder="SV_…" />
            <FieldError>{err("qualtricsSurveyId")}</FieldError>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="sv-url">Participant link</FieldLabel>
            <Input id="sv-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="h-9" placeholder="https://…qualtrics.com/jfe/form/SV_…" />
            <FieldError>{err("url")}</FieldError>
          </Field>
          <Field orientation="horizontal" className="rounded-xl border bg-muted/30 p-3 sm:col-span-2">
            <Switch id="sv-prompt" checked={form.promptEnabled} onCheckedChange={(value) => setForm({ ...form, promptEnabled: value })} />
            <FieldContent>
              <FieldLabel htmlFor="sv-prompt">Remind participants in the app</FieldLabel>
              <FieldDescription>A pop-up and card during the weeks below, until they finish it.</FieldDescription>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="sv-open">From study week</FieldLabel>
            <Input id="sv-open" inputMode="numeric" value={String(form.openWeek)} onChange={(e) => setForm({ ...form, openWeek: Number(e.target.value.replace(/\D/g, "")) || 1 })} className="h-9 w-24" />
          </Field>
          <Field>
            <FieldLabel htmlFor="sv-close">Through study week</FieldLabel>
            <Input id="sv-close" inputMode="numeric" value={String(form.closeWeek)} onChange={(e) => setForm({ ...form, closeWeek: Number(e.target.value.replace(/\D/g, "")) || 1 })} className="h-9 w-24" />
            <FieldError>{err("closeWeek")}</FieldError>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="sv-sync">Qualtrics import</FieldLabel>
            <Select value={form.syncMode} onValueChange={(value) => setForm({ ...form, syncMode: value as Survey["syncMode"] })}>
              <SelectTrigger id="sv-sync" className="w-full data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Don&apos;t import responses</SelectItem>
                <SelectItem value="create_users">Create a control account for each new respondent (baseline)</SelectItem>
                <SelectItem value="update_users">Mark the matching participant as done (midpoint, follow-up)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {form.syncMode !== "off" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Question mapping</p>
            <p className="text-sm text-muted-foreground">Qualtrics export tag or question ID → where the answer goes.</p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border p-2">
              {form.fieldMap.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label="Question"
                    value={entry.source}
                    onChange={(e) => setForm({ ...form, fieldMap: form.fieldMap.map((row, i) => (i === index ? { ...row, source: e.target.value } : row)) })}
                    className="h-8 w-32"
                  />
                  <span className="text-muted-foreground" aria-hidden>
                    →
                  </span>
                  <Select
                    value={entry.target}
                    onValueChange={(value) => setForm({ ...form, fieldMap: form.fieldMap.map((row, i) => (i === index ? { ...row, target: value as typeof row.target } : row)) })}
                  >
                    <SelectTrigger className="w-40" aria-label="Field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGETS.map((target) => (
                        <SelectItem key={target.value} value={target.value}>
                          {target.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove"
                    onClick={() => setForm({ ...form, fieldMap: form.fieldMap.filter((_, i) => i !== index) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, fieldMap: [...form.fieldMap, { source: "", target: "extra" }] })}>
              <Plus /> Add a question
            </Button>
            {err("fieldMap") ? <p className="text-sm text-destructive">{err("fieldMap")}</p> : null}
          </div>
        ) : null}
        {error && !["title", "qualtricsSurveyId", "url", "closeWeek", "fieldMap"].includes(error.path) ? <p className="text-sm text-destructive">{error.message}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QualtricsStatus({ connected, enabled }: { connected: boolean; enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (!connected) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-dashed bg-muted/30 p-4 text-sm">
        <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium">Qualtrics isn&apos;t connected</p>
          <p className="text-muted-foreground">
            Responses aren&apos;t imported automatically. To turn this on, a developer sets <code className="rounded bg-muted px-1">QUALTRICS_API_TOKEN</code> and{" "}
            <code className="rounded bg-muted px-1">QUALTRICS_DATA_CENTER</code> on the server; then switch the import on in{" "}
            <Link href="/admin/settings" className="text-primary hover:underline">
              Settings
            </Link>
            . Until then, mark surveys as done from a person&apos;s page.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 text-sm shadow-soft">
      <CircleCheck className="size-4 text-success" aria-hidden />
      <span className="flex-1">
        Qualtrics is connected. {enabled ? "Responses are imported every 15 minutes." : "Automatic import is off in Settings."}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const data = await runAction(runSyncAction(), (result) =>
            result.summaries.length
              ? result.summaries.map((s) => `${s.survey}: ${s.created} new, ${s.updated} done, ${s.skipped} skipped`).join(" · ")
              : "Nothing to import",
          );
          setPending(false);
          if (data) router.refresh();
        }}
      >
        {pending ? <Spinner /> : <RefreshCw />} Import now
      </Button>
    </div>
  );
}

const OUTCOME: Record<SurveyResponseRow["outcome"], { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-success/12 text-foreground" },
  created_user: { label: "Account created", className: "bg-primary/10 text-primary" },
  updated_user: { label: "Matched", className: "bg-success/12 text-foreground" },
  skipped: { label: "Skipped", className: "bg-warning/15 text-foreground" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive" },
};
const NOTES: Record<string, string> = {
  missing_study_id: "No study ID in the response",
  unknown_study_id: "No account with this study ID",
  missing_name: "No name in the response",
  invalid_email: "Email isn't valid",
  duplicate_study_id: "Study ID already exists",
  duplicate_email: "Email already exists",
};
const SOURCE = { qualtrics: "Qualtrics", participant: "Participant", staff: "Staff" } as Record<string, string>;

export function ResponsesTable({ rows, timezone, titles }: { rows: SurveyResponseRow[]; timezone: string; titles: Record<string, string> }) {
  const columns = useMemo<AdminColumn<SurveyResponseRow>[]>(
    () => [
      {
        id: "at",
        accessorFn: (row) => row.completedAt,
        header: "When",
        cell: ({ row }) => <DateText date={row.original.completedAt} timezone={timezone} pattern="MMM d, yyyy h:mm a" />,
      },
      { id: "survey", accessorFn: (row) => row.surveyKey, header: "Survey", cell: ({ row }) => titles[row.original.surveyKey] ?? row.original.surveyKey },
      {
        id: "who",
        accessorFn: (row) => row.name ?? row.studyId ?? "",
        header: "Person",
        cell: ({ row }) =>
          row.original.userId ? (
            <Link href={`/admin/users/${row.original.userId}`} className="group block">
              <span className="block font-medium group-hover:underline">{row.original.name ?? "Account"}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{row.original.studyId}</span>
            </Link>
          ) : (
            <span className="text-muted-foreground tabular-nums">{row.original.studyId ?? "—"}</span>
          ),
      },
      {
        id: "outcome",
        accessorFn: (row) => row.outcome,
        header: "Result",
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-0.5">
            <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${OUTCOME[row.original.outcome].className}`}>{OUTCOME[row.original.outcome].label}</span>
            {row.original.note ? <span className="text-xs text-muted-foreground">{NOTES[row.original.note] ?? row.original.note}</span> : null}
          </span>
        ),
      },
      { id: "source", accessorFn: (row) => row.source, header: "Source", cell: ({ row }) => SOURCE[row.original.source] ?? row.original.source },
      {
        id: "responseId",
        accessorFn: (row) => row.responseId ?? "",
        header: "Response ID",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.responseId ?? "—"}</span>,
      },
    ],
    [timezone, titles],
  );
  return (
    <DataTable
      data={rows}
      columns={columns}
      noun={["response", "responses"]}
      searchText={(row) => `${row.name ?? ""} ${row.studyId ?? ""} ${row.responseId ?? ""}`}
      searchPlaceholder="Search name, study ID or response ID"
      initialSorting={[{ id: "at", desc: true }]}
      columnClassNames={{ responseId: "hidden lg:table-cell" }}
      empty={<p className="py-12 text-center text-sm text-muted-foreground">No survey responses yet.</p>}
    />
  );
}
