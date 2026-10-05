"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8 || password !== confirm) return;
    setPending(true);
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    if (resetError) {
      setPending(false);
      setError(
        resetError.status === 400
          ? "This link has expired or was already used. Ask for a new one."
          : "We couldn't change your password. Please try again.",
      );
      return;
    }
    router.replace("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-xl"
          aria-invalid={tooShort}
          aria-describedby="password-help"
        />
        <p id="password-help" className={tooShort ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          At least 8 characters.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-11 rounded-xl"
          aria-invalid={mismatch}
        />
        {mismatch ? <p className="text-sm text-destructive">The passwords don&apos;t match.</p> : null}
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="h-11 w-full rounded-xl"
        disabled={pending || password.length < 8 || password !== confirm}
      >
        {pending ? <Spinner /> : null}
        Save password
      </Button>
    </form>
  );
}
