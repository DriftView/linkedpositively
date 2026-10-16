"use client";

import { useEffect } from "react";
import { authClientFor, onAuthChange } from "@/lib/auth-client";
import { usePortal } from "./portal-context";

/**
 * Reloads the page when this portal's session no longer belongs to the person
 * the page was rendered for (signed out, or someone else signed in from
 * another tab), so a tab never keeps showing the previous account's screens.
 * Checks when the tab regains focus and when another tab announces a change.
 */
export function SessionGuard({ userId }: { userId: string }) {
  const portal = usePortal();

  useEffect(() => {
    const client = authClientFor(portal);
    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const { data, error } = await client.getSession();
        // Network trouble isn't a sign-out; try again next time.
        if (!error && (data?.user.id ?? null) !== userId) window.location.reload();
      } catch {
        // Same as above.
      } finally {
        checking = false;
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const stopListening = onAuthChange((changed) => {
      if (changed === portal) void check();
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      stopListening();
    };
  }, [portal, userId]);

  return null;
}
