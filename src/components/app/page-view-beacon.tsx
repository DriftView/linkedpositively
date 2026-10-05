"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Reports each page visited (path only) for the study's usage reports. */
export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const body = JSON.stringify({ path: pathname });
    if (!navigator.sendBeacon?.("/api/usage/page-view", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/usage/page-view", { method: "POST", body, keepalive: true }).catch(() => undefined);
    }
  }, [pathname]);
  return null;
}
