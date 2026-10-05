/**
 * Client helpers for next-safe-action results.
 */
type ResultLike = { serverError?: unknown; validationErrors?: unknown } | undefined;

/** The message to show when an action failed, or null when it succeeded. */
export function actionError(result: ResultLike): string | null {
  if (!result) return "Something went wrong. Please try again.";
  if (typeof result.serverError === "string") return result.serverError;
  if (result.validationErrors) return firstValidationMessage(result.validationErrors) ?? "Please check the form and try again.";
  return null;
}

function firstValidationMessage(errors: unknown): string | null {
  if (!errors || typeof errors !== "object") return null;
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    if (key === "_errors" && Array.isArray(value) && typeof value[0] === "string") return value[0];
    const nested = firstValidationMessage(value);
    if (nested) return nested;
  }
  return null;
}

/** Field → first message, for inline form errors. */
export function fieldErrors(result: ResultLike): Record<string, string> {
  const out: Record<string, string> = {};
  const errors = result?.validationErrors as Record<string, { _errors?: string[] }> | undefined;
  if (!errors) return out;
  for (const [key, value] of Object.entries(errors)) {
    if (key !== "_errors" && value?._errors?.[0]) out[key] = value._errors[0];
  }
  return out;
}
