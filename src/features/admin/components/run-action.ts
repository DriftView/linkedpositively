"use client";

import { toast } from "sonner";

type SafeResult<T> = { data?: T; serverError?: string; validationErrors?: unknown } | undefined;

function firstValidationMessage(errors: unknown): string | null {
  if (!errors || typeof errors !== "object") return null;
  for (const value of Object.values(errors as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (value && typeof value === "object") {
      const nested = (value as { _errors?: string[] })._errors?.[0] ?? firstValidationMessage(value);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Runs a safe action, shows the outcome as a toast and returns the data (or
 * null on failure) so callers can update the UI.
 */
export async function runAction<T>(call: Promise<SafeResult<T>>, success?: string | ((data: T) => string)): Promise<T | null> {
  try {
    const result = await call;
    if (result?.serverError) {
      toast.error(result.serverError);
      return null;
    }
    if (result?.validationErrors) {
      toast.error(firstValidationMessage(result.validationErrors) ?? "Please check the form and try again.");
      return null;
    }
    const data = result?.data as T;
    if (success) toast.success(typeof success === "function" ? success(data) : success);
    return data;
  } catch {
    toast.error("Something went wrong. Please try again.");
    return null;
  }
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
