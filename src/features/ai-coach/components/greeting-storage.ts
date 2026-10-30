"use client";

/**
 * Where the floating coach remembers its greeting, on this device: whether
 * the member turned it off, the day it last greeted, and whether it greeted
 * in this browser session. Storage can be unavailable (private windows,
 * blocked site data): reads then say "not greeted, not off" and writes are
 * skipped, so the worst case is one extra greeting.
 */

const OFF_KEY = "lp-coach-greeting-off";
const DAY_KEY = "lp-coach-greeted-day";
const SESSION_KEY = "lp-coach-greeted";

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // storage unavailable
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** The member's local date, e.g. "2026-10-30". */
export function localDay(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function greetingState() {
  return {
    enabled: read(local, OFF_KEY) !== "1",
    lastGreetedDay: read(local, DAY_KEY),
    greetedThisSession: read(session, SESSION_KEY) === "1",
  };
}

export function markGreeted(day = localDay()) {
  write(local, DAY_KEY, day);
  write(session, SESSION_KEY, "1");
}

export function greetingEnabled() {
  return read(local, OFF_KEY) !== "1";
}

export function setGreetingEnabled(enabled: boolean) {
  write(local, OFF_KEY, enabled ? null : "1");
}
