import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error, welcome } = await searchParams;

  if (typeof token !== "string" || error) {
    return (
      <>
        <h1 className="text-3xl font-semibold">This link has expired</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Password links work once and expire after a day. Ask for a new one and we&apos;ll email it to you.
        </p>
        <Button asChild size="lg" className="mt-8 h-11 w-full rounded-xl">
          <Link href="/forgot-password">Get a new link</Link>
        </Button>
      </>
    );
  }

  const isWelcome = welcome === "1";
  return (
    <>
      <h1 className="text-3xl font-semibold">{isWelcome ? "Set up your password" : "Choose a new password"}</h1>
      <p className="mt-2 text-muted-foreground">
        {isWelcome ? "Welcome! Pick a password to finish setting up your account." : "Use at least 8 characters."}
      </p>
      <ResetPasswordForm token={token} />
    </>
  );
}
