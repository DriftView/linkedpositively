"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function LoginForm({ next, passwordWasReset }: { next: string; passwordWasReset: boolean }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const login = identifier.trim();
    const result = login.includes("@")
      ? await authClient.signIn.email({ email: login, password })
      : await authClient.signIn.username({ username: login, password });

    if (result.error) {
      setPending(false);
      setFailedOnce(true);
      const status = result.error.status;
      setError(
        status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : status === 403 && result.error.message
            ? result.error.message
            : "That username or password doesn't match. Please try again.",
      );
      return;
    }
    router.replace(next);
    router.refresh();
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
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-[0.95rem]" disabled={pending || !identifier || !password}>
        {pending ? <Spinner /> : null}
        {pending ? "Logging in…" : "Log in"}
        {pending ? null : <ArrowRight data-icon="inline-end" />}
      </Button>
    </form>
  );
}
