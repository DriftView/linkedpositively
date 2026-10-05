/** Turns a next-safe-action result into a user-facing error message (or null on success). */
export function actionError(result: { serverError?: unknown; validationErrors?: unknown } | undefined | null): string | null {
  if (!result) return "Something went wrong. Please try again.";
  if (typeof result.serverError === "string") return result.serverError;
  if (result.serverError) return "Something went wrong. Please try again.";
  if (result.validationErrors) return firstMessage(result.validationErrors) ?? "Please check the form and try again.";
  return null;
}

function firstMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstMessage(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = firstMessage(item);
      if (found) return found;
    }
  }
  return null;
}
