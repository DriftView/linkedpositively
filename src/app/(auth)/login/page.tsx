import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { portalForPath } from "@/lib/portal";
import { safeInternalPath } from "@/lib/safe-path";
import { homePathFor } from "@/server/auth/roles";
import { getViewerIn } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reset } = await searchParams;
  // Without a requested page, the user's role picks their home page.
  const safeNext = safeInternalPath(typeof next === "string" ? next : null, "/start");

  // Already signed in to the portal they're headed for: go home. Signed in to
  // the other portal only: still show the form, so staff and a participant can
  // both be signed in in this browser.
  const portal = portalForPath(safeNext.split(/[?#]/)[0]);
  const viewer = portal ? await getViewerIn(portal) : ((await getViewerIn("member")) ?? (await getViewerIn("staff")));
  if (viewer) redirect(homePathFor(viewer.roles));

  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">Log in with your username or email.</p>
      <LoginForm next={safeNext} passwordWasReset={reset === "1"} />
    </>
  );
}
