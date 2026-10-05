"use client";

import { useSyncExternalStore } from "react";
import type { TodayCheckin } from "../types";

/**
 * Tiny in-memory store so a calendar on the same page reflects today's
 * check-in the instant it is tapped, before the server refresh arrives.
 */
let current: TodayCheckin | null = null;
const listeners = new Set<() => void>();

export function publishToday(value: TodayCheckin) {
  current = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveToday(enabled: boolean) {
  return useSyncExternalStore(
    subscribe,
    () => (enabled ? current : null),
    () => null,
  );
}
