"use client";

import { createContext, use } from "react";
import type { Portal } from "@/lib/portal";

/** The portal the current shell belongs to (src/lib/portal.ts). */
export const PortalContext = createContext<Portal>("member");

export function usePortal() {
  return use(PortalContext);
}
