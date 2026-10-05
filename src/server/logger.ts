import "server-only";
import pino from "pino";

/**
 * Structured server logger. Participant data is health data: log ids, never
 * names, phone numbers, emails or free-text answers. The redact list is a
 * safety net, not a licence to log whole objects.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.email",
      "*.phone",
      "*.phoneNumber",
      "*.body",
      "*.answers",
      "headers.cookie",
      "headers.authorization",
    ],
    censor: "[redacted]",
  },
});
