"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { AtSign, Check, Lock } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { updateAccount } from "../../actions";
import { formatPhone, normalizePhone } from "../../phone";
import { TimezonePicker } from "./timezone-picker";

type Initial = { name: string; username: string; email: string; timezone: string; phone: string };

export function AccountForm({ initial, showPhone }: { initial: Initial; showPhone: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [phone, setPhone] = useState(formatPhone(initial.phone));
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { executeAsync, isPending } = useAction(updateAccount);

  const emailChanged = email.trim().toLowerCase() !== saved.email.toLowerCase();
  const phoneValue = phone.trim() ? normalizePhone(phone) : "";
  const dirty =
    name.trim() !== saved.name ||
    emailChanged ||
    timezone !== saved.timezone ||
    (showPhone && (phoneValue ?? phone) !== saved.phone);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Add the name people will see.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (showPhone && phone.trim() && !phoneValue) nextErrors.phone = "Enter a mobile number like (555) 123-4567.";
    if (emailChanged && !currentPassword) nextErrors.currentPassword = "Enter your current password to change your email.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const result = await executeAsync({
      name: name.trim(),
      email: email.trim(),
      timezone,
      phone: showPhone ? phone.trim() : undefined,
      currentPassword: emailChanged ? currentPassword : undefined,
    });
    if (!result?.data) {
      const message = result?.serverError ?? "We couldn't save your details. Please try again.";
      if (/password/i.test(message)) setErrors({ currentPassword: message });
      toast.error(message);
      return;
    }
    const nextSaved = {
      ...saved,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      timezone,
      phone: showPhone ? (result.data.phone ?? "") : saved.phone,
    };
    setSaved(nextSaved);
    setEmail(nextSaved.email);
    setPhone(formatPhone(nextSaved.phone));
    setCurrentPassword("");
    toast.success(result.data.emailChanged ? "Saved! Your email has been changed." : "Your details are saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Display name" error={errors.name} hint="Shown with your posts and on your profile.">
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={80}
            className="h-11 rounded-xl"
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field id="username" label="Username" hint="Your sign-in name. Ask the study team if it needs to change.">
          <div className="relative">
            <AtSign className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="username" value={saved.username} readOnly className="h-11 rounded-xl bg-muted/60 pl-9 text-muted-foreground" />
            <Lock className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-label="Can't be changed here" />
          </div>
        </Field>
      </div>

      <Field id="email" label="Email" error={errors.email} hint="We use it for password resets. It's never shown to other members.">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="h-11 rounded-xl"
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <AnimatePresence initial={false}>
        {emailChanged ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-secondary/70 p-4">
              <Field id="email-password" label="Current password" error={errors.currentPassword} hint="To keep your account safe, confirm it's you.">
                <Input
                  id="email-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className="h-11 rounded-xl bg-card"
                  aria-invalid={Boolean(errors.currentPassword)}
                />
              </Field>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="timezone" label="Timezone" hint="Reminders and your study days follow it.">
          <TimezonePicker id="timezone" value={timezone} onChange={setTimezone} />
        </Field>
        {showPhone ? (
          <Field id="phone" label="Mobile number" error={errors.phone} hint="For text message reminders. Leave empty for no texts.">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onBlur={() => {
                const normalized = normalizePhone(phone);
                if (normalized) setPhone(formatPhone(normalized));
              }}
              autoComplete="tel"
              placeholder="(555) 123-4567"
              className="h-11 rounded-xl"
              aria-invalid={Boolean(errors.phone)}
            />
          </Field>
        ) : null}
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" className="h-11 rounded-full px-6 text-[0.95rem]" disabled={!dirty || isPending}>
          {isPending ? <Spinner /> : <Check />} Save changes
        </Button>
      </div>
    </form>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
