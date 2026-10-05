import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-path";
import { homePathFor } from "@/server/auth/roles";
import { getViewer } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect(homePathFor(viewer.roles));
  const { next, reset } = await searchParams;
  // Without a requested page, /start picks the home page for the user's role.
  const safeNext = safeInternalPath(typeof next === "string" ? next : null, "/start");

  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">Log in with your username or email.</p>
      <LoginForm next={safeNext} passwordWasReset={reset === "1"} />
    </>
  );
}
