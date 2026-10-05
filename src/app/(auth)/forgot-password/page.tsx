"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const { execute, status, result } = useAction(requestPasswordReset);

  if (status === "hasSucceeded") {
    return (
      <div>
        <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
          <MailCheck className="size-6" />
        </span>
        <h1 className="text-3xl font-semibold">Check your email</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          If an account matches <span className="font-medium text-foreground">{identifier}</span>, we&apos;ve sent a link to
          choose a new password. It can take a minute to arrive.
        </p>
        <Button asChild variant="outline" size="lg" className="mt-8 h-11 w-full rounded-xl">
          <Link href="/login">Back to log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to log in
      </Link>
      <h1 className="text-3xl font-semibold">Forgot your password?</h1>
      <p className="mt-2 text-muted-foreground">Enter your username or email and we&apos;ll email you a reset link.</p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          execute({ identifier });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="identifier">Username or email</Label>
          <Input
            id="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="h-11 rounded-xl"
            required
          />
        </div>
        {result.serverError ? <p className="text-sm text-destructive">{result.serverError}</p> : null}
        <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={!identifier || status === "executing"}>
          {status === "executing" ? <Spinner /> : null}
          Send reset link
        </Button>
      </form>
    </>
  );
}
