"use client";

import Link from "next/link";
import { ArrowLeft, HeartHandshake, Send } from "lucide-react";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { suggestResourceAction } from "../actions";
import { actionError, fieldErrors } from "../client";
import { US_STATES } from "../lib";

const EMPTY = { name: "", phone: "", website: "", street: "", city: "", state: "", zip: "", notes: "" };

/** "Suggest a resource" (old /add-resource). Suggestions stay hidden until staff publish them. */
export function SuggestForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await suggestResourceAction(values);
      const fields = fieldErrors(result);
      setErrors(fields);
      const error = actionError(result);
      if (error) {
        if (!Object.keys(fields).length) toast.error(error);
        return;
      }
      setSent(true);
      setValues(EMPTY);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="rounded-3xl border bg-card p-7 text-center shadow-soft sm:p-10"
        role="status"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-apricot/25 text-primary">
          <HeartHandshake className="size-8" aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold">Thank you for your suggestion!</h2>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Our team reviews every suggestion. Once it&apos;s approved, it&apos;ll show up in Resources for everyone. Know
          more places? We&apos;d love to hear about them.
        </p>
        <p className="mt-4 font-heading font-semibold text-primary">The Link Positively team</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setSent(false)}>
            Suggest another
          </Button>
          <Button asChild className="h-11 rounded-full px-5">
            <Link href="/resources">Back to resources</Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-3xl border bg-card p-5 shadow-soft sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name of the place" error={errors.name} className="sm:col-span-2" required>
          <Input id="name" value={values.name} onChange={set("name")} maxLength={200} autoComplete="organization" required aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="phone" label="Phone number" error={errors.phone}>
          <Input id="phone" type="tel" value={values.phone} onChange={set("phone")} maxLength={60} inputMode="tel" />
        </Field>
        <Field id="website" label="Website" error={errors.website}>
          <Input id="website" value={values.website} onChange={set("website")} maxLength={500} inputMode="url" placeholder="example.org" />
        </Field>
        <Field id="street" label="Street address" error={errors.street} className="sm:col-span-2">
          <Input id="street" value={values.street} onChange={set("street")} maxLength={300} autoComplete="street-address" />
        </Field>
        <Field id="city" label="City" error={errors.city}>
          <Input id="city" value={values.city} onChange={set("city")} maxLength={120} autoComplete="address-level2" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="state" label="State" error={errors.state}>
            <Select value={values.state} onValueChange={(state) => setValues((current) => ({ ...current, state }))}>
              <SelectTrigger id="state" className="h-11 w-full rounded-xl data-[size=default]:h-11">
                <SelectValue placeholder="Pick" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {US_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="zip" label="ZIP code" error={errors.zip}>
            <Input id="zip" value={values.zip} onChange={set("zip")} maxLength={10} inputMode="numeric" autoComplete="postal-code" aria-invalid={Boolean(errors.zip)} />
          </Field>
        </div>
        <Field id="notes" label="What should people know?" hint="Services, hours, who it's for, what it was like." error={errors.notes} className="sm:col-span-2">
          <Textarea id="notes" value={values.notes} onChange={set("notes")} maxLength={2000} rows={4} className="rounded-xl" />
        </Field>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="h-11 rounded-full px-4">
          <Link href="/resources">
            <ArrowLeft aria-hidden />
            Cancel
          </Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-11 rounded-full px-6 font-semibold">
          {pending ? <Spinner /> : <Send aria-hidden />}
          Send suggestion
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5 [&_input]:h-11 [&_input]:rounded-xl", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-brand-magenta" aria-hidden>*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
