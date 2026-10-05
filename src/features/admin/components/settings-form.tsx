"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { saveMidpointUrlAction } from "@/features/surveys/actions";
import { saveSettingsAction } from "../actions";
import { settingsSchema, type AppSettings } from "../settings-schema";
import { runAction } from "./run-action";

type Errors = Partial<Record<keyof AppSettings | "midpointUrl", string>>;

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-7 first:pt-0 last:border-0 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">{children}</div>
    </section>
  );
}

function Toggle({ id, label, description, checked, onChange, disabled }: { id: string; label: string; description: React.ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <Field orientation="horizontal" className="items-start justify-between gap-6">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Field>
  );
}

export function SettingsForm({ settings, midpointUrl, qualtricsConnected }: { settings: AppSettings; midpointUrl: string; qualtricsConnected: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [midpoint, setMidpoint] = useState(midpointUrl);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings) || midpoint !== midpointUrl;

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = settingsSchema.safeParse(form);
    const next: Errors = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[issue.path[0] as keyof AppSettings] ??= issue.message;
    if (midpoint && !/^https:\/\/\S+$/.test(midpoint)) next.midpointUrl = "Enter the survey's https:// link.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setPending(true);
    let ok = true;
    if (JSON.stringify(form) !== JSON.stringify(settings)) ok = Boolean(await runAction(saveSettingsAction(parsed.data!)));
    if (ok && midpoint !== midpointUrl) ok = Boolean(await runAction(saveMidpointUrlAction({ url: midpoint })));
    setPending(false);
    if (ok) {
      toast.success("Settings saved");
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} noValidate className="pb-24">
      <Section title="Study" description="Shown in emails to participants and staff.">
        <Field data-invalid={Boolean(errors.studyName)}>
          <FieldLabel htmlFor="s-name">Study name</FieldLabel>
          <Input id="s-name" value={form.studyName} onChange={(e) => set("studyName", e.target.value)} className="h-9" />
          <FieldError>{errors.studyName}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.contactEmail)}>
            <FieldLabel htmlFor="s-email">Study contact email</FieldLabel>
            <Input id="s-email" type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className="h-9" placeholder="study-team@example.org" />
            {errors.contactEmail ? <FieldError>{errors.contactEmail}</FieldError> : <FieldDescription>Added to welcome and account emails.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="s-phone">Study phone (optional)</FieldLabel>
            <Input id="s-phone" type="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className="h-9" />
          </Field>
        </div>
      </Section>

      <Section title="SMS program" description="The welcome text and 24 weekly texts. Delivery also depends on the server's Twilio settings.">
        <Toggle id="s-sms" label="Send program texts" description="Switch off to pause every study text. Texts missed for more than a day are skipped." checked={form.smsProgramEnabled} onChange={(v) => set("smsProgramEnabled", v)} />
        <Toggle id="s-welcome" label="Welcome text" description="Sent 15 minutes after someone is converted to participant." checked={form.smsWelcomeEnabled} onChange={(v) => set("smsWelcomeEnabled", v)} />
        <Toggle
          id="s-accountmail"
          label="Email people when they're randomized"
          description="Lets them know their account is ready (with a set-password link if they haven't chosen one)."
          checked={form.accountEmailOnRandomize}
          onChange={(v) => set("accountEmailOnRandomize", v)}
        />
      </Section>

      <Section title="End of study" description="Participants lose access once their study period is over.">
        <Toggle
          id="s-autoblock"
          label="Deactivate participants automatically"
          description="Checked every night. Staff can reactivate someone from their page."
          checked={form.autoBlockEnabled}
          onChange={(v) => set("autoBlockEnabled", v)}
        />
        <Field data-invalid={Boolean(errors.autoBlockDays)} className="max-w-xs" data-disabled={!form.autoBlockEnabled}>
          <FieldLabel htmlFor="s-days">Days after the start date</FieldLabel>
          <Input
            id="s-days"
            inputMode="numeric"
            value={String(form.autoBlockDays)}
            onChange={(e) => set("autoBlockDays", Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="h-9 w-28 tabular-nums"
            disabled={!form.autoBlockEnabled}
          />
          {errors.autoBlockDays ? <FieldError>{errors.autoBlockDays}</FieldError> : <FieldDescription>The study used 150 days (the 24-week program is 168).</FieldDescription>}
        </Field>
      </Section>

      <Section title="Surveys" description="Qualtrics surveys and the in-app reminders to take them.">
        <Field data-invalid={Boolean(errors.midpointUrl)}>
          <FieldLabel htmlFor="s-midpoint">Midpoint survey link</FieldLabel>
          <Input id="s-midpoint" type="url" value={midpoint} onChange={(e) => setMidpoint(e.target.value)} className="h-9" placeholder="https://…qualtrics.com/jfe/form/SV_…" />
          {errors.midpointUrl ? <FieldError>{errors.midpointUrl}</FieldError> : <FieldDescription>Each participant&apos;s study ID is added as ?ID=… when they open it.</FieldDescription>}
        </Field>
        <Toggle id="s-prompts" label="Survey reminders in the app" description="Pop-up and card when a survey is due (the midpoint survey opens in week 10)." checked={form.surveyPromptsEnabled} onChange={(v) => set("surveyPromptsEnabled", v)} />
        <Toggle
          id="s-qualtrics"
          label="Import responses from Qualtrics"
          description={
            qualtricsConnected ? (
              "Every 15 minutes. Baseline responses create control accounts; later surveys mark people as done."
            ) : (
              <>
                Not available: the Qualtrics API token and data center aren&apos;t configured on the server. <Link href="/admin/surveys">Learn more</Link>
              </>
            )
          }
          checked={form.qualtricsSyncEnabled && qualtricsConnected}
          onChange={(v) => set("qualtricsSyncEnabled", v)}
          disabled={!qualtricsConnected}
        />
      </Section>

      <div className={`fixed inset-x-0 bottom-0 z-30 transition-transform duration-200 md:left-(--sidebar-width) ${dirty ? "translate-y-0" : "invisible translate-y-full"}`} aria-hidden={!dirty}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-t-2xl border border-b-0 bg-popover/95 px-5 py-3 shadow-lift backdrop-blur">
          <span className="text-sm">You have unsaved changes</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              tabIndex={dirty ? 0 : -1}
              onClick={() => {
                setForm(settings);
                setMidpoint(midpointUrl);
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button type="submit" disabled={pending} tabIndex={dirty ? 0 : -1}>
              {pending ? <Spinner /> : null}
              Save settings
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
