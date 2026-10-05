import { NextResponse, type NextRequest } from "next/server";
import { recordLegacyClick } from "@/features/sms/legacy-click";
import { legacyPathFor } from "@/features/admin/legacy-redirects";
import { safeInternalPath } from "@/features/sms/links";
import { logger } from "@/server/logger";

/**
 * Old text messages linked to `<page>?sms=<uid>:<week>`. The proxy sends any
 * request carrying `?sms=` here (`/r/legacy?sms=…&next=<page>`). The click is
 * only recorded when the signed-in person is the migrated account with that
 * uid — the uid in the URL alone is never trusted.
 */
export async function GET(request: NextRequest) {
  const sms = request.nextUrl.searchParams.get("sms") ?? "";
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"), "/");
  try {
    await recordLegacyClick(sms, request.headers);
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "legacy sms click failed");
  }
  const response = NextResponse.redirect(new URL(legacyPathFor(next), request.nextUrl.origin), 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
