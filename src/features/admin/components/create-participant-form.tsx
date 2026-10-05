"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck, FlaskConical, HeartHandshake, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { normalizePhone, formatPhone } from "@/features/sms/phone";
import { createParticipantAction } from "../actions";
import { createParticipantSchema, TIMEZONES } from "../schemas";
import { runAction } from "./run-action";

type Form = {
  studyId: string;
  username: string;
  email: string;
  phone: string;
  arm: "control" | "participant";
  ecoach: boolean;
  coachId: string;
  pronouns: string;
  age: string;
  timezone: string;
  sendWelcome: boolean;
};

const EMPTY: Form = {
  studyId: "",
  username: "",
  email: "",
  phone: "",
  arm: "control",
  ecoach: false,
  coachId: "",
  pronouns: "",
  age: "",
  timezone: "America/New_York",
  sendWelcome: true,
};

export function CreateParticipantForm({ coaches, canRandomize }: { coaches: { id: string; name: string }[]; canRandomize: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ userId: string; username: string; emailed: boolean } | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      studyId: form.studyId,
      username: form.username,
      email: form.email,
      phone: form.phone,
      participant: form.arm === "participant",
      ecoach: form.ecoach,
      coachId: form.ecoach && form.coachId ? form.coachId : null,
      pronouns: form.pronouns,
      age: form.age.trim() ? Number(form.age) : null,
      timezone: form.timezone,
      sendWelcome: form.sendWelcome,
    };
    const parsed = createParticipantSchema.safeParse(input);
    if (!parsed.success || (form.age.trim() && !Number.isInteger(Number(form.age)))) {
      const next: typeof errors = {};
      if (form.age.trim() && !Number.isInteger(Number(form.age))) next.age = "Enter an age between 10 and 99.";
      for (const issue of parsed.error?.issues ?? []) {
        const key = (issue.path[0] === "participant" ? "arm" : issue.path[0]) as keyof Form;
        next[key] ??= issue.message;
      }
      setErrors(next);
      document.getElementById(`new-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setPending(true);
    const data = await runAction(createParticipantAction(parsed.data));
    setPending(false);
    if (data) {
      setCreated({ ...data, username: form.username });
      router.refresh();
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg animate-rise rounded-2xl border bg-card p-8 text-center shadow-soft">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CircleCheck className="size-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">{created.username} is set up</h2>
        <p className="mt-2 text-muted-foreground">
          {created.emailed ? "We emailed them a link to choose a password. " : "No email was sent — send a welcome link from their page when you're ready. "}
          {form.arm === "participant" ? "Their welcome text goes out in about 15 minutes." : "They're in the control arm until you randomize them."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/users/${created.userId}`}>Open their page</Link>
          </Button>
          <Button
            onClick={() => {
              setForm({ ...EMPTY, timezone: form.timezone });
              setCreated(null);
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    );
  }

  const phonePreview = form.phone ? normalizePhone(form.phone) : null;
  const input = (key: keyof Form, props: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`new-${key}`}
      value={form[key] as string}
      onChange={(event) => set(key, event.target.value as never)}
      aria-invalid={Boolean(errors[key])}
      className="h-10"
      {...props}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <FieldSet>
            <FieldLegend className="text-base font-semibold">Account</FieldLegend>
            <FieldDescription>They&apos;ll sign in with the username or email. We never email passwords.</FieldDescription>
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.studyId)}>
                <FieldLabel htmlFor="new-studyId">Study ID</FieldLabel>
                {input("studyId", { className: "h-10 tabular-nums", autoFocus: true, autoComplete: "off" })}
                <FieldError>{errors.studyId}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.username)}>
                <FieldLabel htmlFor="new-username">Username</FieldLabel>
                {input("username", { autoComplete: "off", spellCheck: false })}
                {errors.username ? <FieldError>{errors.username}</FieldError> : <FieldDescription>Enter the user&apos;s name without spaces.</FieldDescription>}
              </Field>
              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor="new-email">Email</FieldLabel>
                {input("email", { type: "email", autoComplete: "off" })}
                <FieldError>{errors.email}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.phone)}>
                <FieldLabel htmlFor="new-phone">Mobile number</FieldLabel>
                {input("phone", { type: "tel", placeholder: "+19879543210", autoComplete: "off" })}
                {errors.phone ? (
                  <FieldError>{errors.phone}</FieldError>
                ) : (
                  <FieldDescription>{phonePreview ? `Texts go to ${formatPhone(phonePreview)}` : "With country code. Eg. +19879543210"}</FieldDescription>
                )}
              </Field>
            </FieldGroup>
          </FieldSet>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <FieldSet>
            <FieldLegend className="text-base font-semibold">Study arm</FieldLegend>
            <RadioGroup value={form.arm} onValueChange={(value) => set("arm", value as Form["arm"])} className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  value: "control",
                  icon: FlaskConical,
                  title: "Control",
                  body: "Starts in the control arm. Randomize them later from the Randomization page.",
                },
                {
                  value: "participant",
                  icon: Sparkles,
                  title: "Participant — start now",
                  body: "Starts the intervention today: welcome text in 15 minutes, then a text every week for 24 weeks.",
                  disabled: !canRandomize,
                },
              ].map((option) => (
                <FieldLabel key={option.value} htmlFor={`arm-${option.value}`} className={cn(option.disabled && "opacity-50")}>
                  <Field orientation="horizontal" className="items-start">
                    <FieldContent>
                      <span className="flex items-center gap-2 font-medium">
                        <option.icon className="size-4 text-primary" aria-hidden /> {option.title}
                      </span>
                      <FieldDescription>{option.body}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={option.value} id={`arm-${option.value}`} disabled={option.disabled} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>

          <div className="mt-5 rounded-xl border bg-muted/30 p-4">
            <Field orientation="horizontal">
              <Checkbox id="new-ecoach" checked={form.ecoach} onCheckedChange={(value) => set("ecoach", Boolean(value))} />
              <FieldContent>
                <FieldLabel htmlFor="new-ecoach" className="flex items-center gap-2">
                  <HeartHandshake className="size-4 text-brand-magenta" aria-hidden /> Also enrol in Peer Navigation (eCoach)
                </FieldLabel>
                <FieldDescription>They&apos;ll get access to coaching with a peer navigator.</FieldDescription>
              </FieldContent>
            </Field>
            {form.ecoach ? (
              <Field className="mt-4 animate-rise pl-7" data-invalid={Boolean(errors.coachId)}>
                <FieldLabel htmlFor="new-coachId">Peer navigator</FieldLabel>
                <Select value={form.coachId} onValueChange={(value) => set("coachId", value)}>
                  <SelectTrigger id="new-coachId" className="w-full max-w-sm data-[size=default]:h-10" aria-invalid={Boolean(errors.coachId)}>
                    <SelectValue placeholder="Choose a peer navigator" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.coachId ? <FieldError>{errors.coachId}</FieldError> : null}
                {!coaches.length ? <FieldDescription>No peer navigators yet — give someone that role first.</FieldDescription> : null}
              </Field>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <FieldSet>
            <FieldLegend className="text-base font-semibold">About them</FieldLegend>
            <FieldGroup className="grid gap-5 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="new-pronouns">Pronouns</FieldLabel>
                {input("pronouns", { placeholder: "Eg. he/him, she/her" })}
              </Field>
              <Field data-invalid={Boolean(errors.age)}>
                <FieldLabel htmlFor="new-age">Age</FieldLabel>
                {input("age", { inputMode: "numeric", className: "h-10 w-24" })}
                <FieldError>{errors.age}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-timezone">Timezone</FieldLabel>
                <Select value={form.timezone} onValueChange={(value) => set("timezone", value)}>
                  <SelectTrigger id="new-timezone" className="w-full data-[size=default]:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((zone) => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </FieldSet>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="text-base font-semibold">What happens next</h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">1</span>
              <span>
                The account is created{form.arm === "control" ? " in the control arm" : ""}
                {form.ecoach ? ", with Peer Navigation" : ""}.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">2</span>
              <span>{form.sendWelcome ? "They get an email to choose their password (link valid 7 days)." : "No email yet — you can send the welcome link later."}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">3</span>
              <span>
                {form.arm === "participant"
                  ? "Week 1 starts today. The welcome text goes out in 15 minutes."
                  : "When you randomize them, week 1 starts and the texts begin."}
              </span>
            </li>
          </ol>
          <Field orientation="horizontal" className="mt-5 rounded-xl border bg-muted/30 p-3">
            <Switch id="new-sendWelcome" checked={form.sendWelcome} onCheckedChange={(value) => set("sendWelcome", value)} />
            <FieldLabel htmlFor="new-sendWelcome" className="flex items-center gap-2 font-normal">
              <Mail className="size-4 text-muted-foreground" aria-hidden /> Email a welcome link now
            </FieldLabel>
          </Field>
          <Button type="submit" size="lg" className="mt-5 h-10 w-full" disabled={pending}>
            {pending ? <Spinner /> : null}
            Create participant
          </Button>
        </div>
      </aside>
    </form>
  );
}
