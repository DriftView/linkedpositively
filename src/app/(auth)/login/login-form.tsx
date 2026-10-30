"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { primeCoachAudio } from "@/features/ai-coach/audio-unlock";
import { announceAuthChange } from "@/lib/auth-client";
import type { Portal } from "@/lib/portal";
import { cn } from "@/lib/utils";

export function LoginForm({ next, passwordWasReset }: { next: string; passwordWasReset: boolean }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Inside the click: lets the AI Coach greet the member out loud on the page they land on.
    primeCoachAudio();
    setPending(true);
    setError(null);

    // Signs in to the staff or member portal, whichever the account belongs to.
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: identifier.trim(), password, next }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as {
      portal?: Portal;
      destination?: string;
      message?: string | null;
    } | null;

    if (!response?.ok || !result?.destination || !result.portal) {
      setPending(false);
      setFailedOnce(true);
      const status = response?.status;
      setError(
        status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : status === 403 && result?.message
            ? result.message
            : "That username or password doesn't match. Please try again.",
      );
      return;
    }
    announceAuthChange(result.portal);
    // Opened in place, not with a full load, so the sound this click allowed carries over (the coach's
    // greeting). The new session's pages are rendered fresh: nothing from this page is cached for them.
    try {
      router.replace(result.destination);
    } catch {
      window.location.assign(result.destination);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
      {passwordWasReset ? (
        <p className="flex items-start gap-2 rounded-xl bg-success/10 px-3.5 py-3 text-sm text-success">
          <CircleCheck className="mt-0.5 size-4 shrink-0" /> Your password was changed. Log in with the new one.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="identifier">Username or email</Label>
        <Input
          id="identifier"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          className="h-11 rounded-xl"
          aria-invalid={Boolean(error)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className={cn(
              "text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline",
              failedOnce && "font-medium text-primary",
            )}
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-xl pr-11"
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-11 w-full rounded-xl text-[0.95rem]"
        disabled={pending || !identifier || !password}
      >
        {pending ? <Spinner /> : null}
        {pending ? "Logging in…" : "Log in"}
        {pending ? null : <ArrowRight data-icon="inline-end" />}
      </Button>
    </form>
  );
}
