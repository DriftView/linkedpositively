import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { env } from "@/env";
import { logger } from "@/server/logger";

let transporter: Transporter | null = null;

/**
 * Sends an email rendered from a React Email template. With DELIVERY_MODE=log
 * (the default) the email is only logged, so local copies never email people.
 */
export async function sendMail(input: { to: string; subject: string; template: ReactElement; ref?: string }) {
  const html = await render(input.template);
  const text = await render(input.template, { plainText: true });

  if (env.DELIVERY_MODE !== "live" || !env.SMTP_URL) {
    // The text (with sign-in links) is logged for local testing only, never in production.
    logger.info({ ref: input.ref, subject: input.subject, text: env.NODE_ENV === "production" ? undefined : text }, "email (log mode, not sent)");
    return { ok: true as const };
  }

  transporter ??= nodemailer.createTransport(env.SMTP_URL);
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, to: input.to, subject: input.subject, html, text });
    return { ok: true as const };
  } catch (error) {
    logger.error({ ref: input.ref, err: error instanceof Error ? error.message : error }, "email failed");
    return { ok: false as const };
  }
}
