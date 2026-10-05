"use client";

import { useRouter } from "next/navigation";
import { Check, Circle, Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Field } from "./account-form";

const MIN = 8;

/**
 * Change password. Unlike the old site, the current password is required
 * (docs/legacy/03 §14.4). Other devices are signed out by default.
 */
export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: "current" | "next" | "confirm"; message: string } | null>(null);

  const rules = [
    { ok: next.length >= MIN, label: `At least ${MIN} characters` },
    { ok: next.length > 0 && next !== current, label: "Different from your current password" },
    { ok: next.length > 0 && next === confirm, label: "Both new passwords match" },
  ];
  const valid = current.length > 0 && rules.every((rule) => rule.ok);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return setError({ field: "current", message: "Enter your current password." });
    if (next.length < MIN) return setError({ field: "next", message: `Use at least ${MIN} characters.` });
    if (next !== confirm) return setError({ field: "confirm", message: "Passwords do not match!" });
    setError(null);
    setPending(true);
    const { error: failure } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: revokeOthers,
    });
    setPending(false);
    if (failure) {
      const wrong = failure.status === 400 || /invalid password/i.test(failure.message ?? "");
      const message = wrong
        ? "That isn't your current password."
        : failure.status === 429
          ? "Too many tries. Please wait a minute."
          : (failure.message ?? "We couldn't change your password.");
      setError({ field: wrong ? "current" : "next", message });
      toast.error(message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Your password has been changed.", {
      description: revokeOthers ? "You've been signed out on your other devices." : undefined,
    });
    if (revokeOthers) router.refresh();
  }

  const type = show ? "text" : "password";

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field id="current-password" label="Current password" error={error?.field === "current" ? error.message : undefined}>
        <div className="relative">
          <Input
            id="current-password"
            type={type}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
            className="h-11 rounded-xl pr-11"
            aria-invalid={error?.field === "current"}
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground"
            aria-label={show ? "Hide passwords" : "Show passwords"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="new-password" label="New password" error={error?.field === "next" ? error.message : undefined}>
          <Input
            id="new-password"
            type={type}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
            placeholder="new password"
            className="h-11 rounded-xl"
            aria-invalid={error?.field === "next"}
          />
        </Field>
        <Field id="confirm-password" label="Confirm new password" error={error?.field === "confirm" ? error.message : undefined}>
          <Input
            id="confirm-password"
            type={type}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            placeholder="confirm new password"
            className="h-11 rounded-xl"
            aria-invalid={error?.field === "confirm"}
          />
        </Field>
      </div>

      <ul className="grid gap-1.5 text-sm sm:grid-cols-3" aria-label="Password requirements">
        {rules.map((rule) => (
          <li key={rule.label} className={cn("flex items-center gap-1.5", rule.ok ? "text-success" : "text-muted-foreground")}>
            {rule.ok ? <Check className="size-3.5 shrink-0" aria-hidden /> : <Circle className="size-3 shrink-0" aria-hidden />}
            <span>{rule.label}</span>
            <span className="sr-only">{rule.ok ? "(done)" : "(not yet)"}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <Label htmlFor="revoke-others" className="flex cursor-pointer items-center gap-2.5 font-normal">
          <Checkbox id="revoke-others" checked={revokeOthers} onCheckedChange={(value) => setRevokeOthers(value === true)} />
          Sign out on my other devices
        </Label>
        <Button type="submit" className="h-11 rounded-full px-6 text-[0.95rem]" disabled={!valid || pending}>
          {pending ? <Spinner /> : <KeyRound />} Change password
        </Button>
      </div>
    </form>
  );
}
