import { NextResponse, type NextRequest } from "next/server";
import { verifyLinkCode } from "@/features/sms/links";
import { recordClick } from "@/features/sms/service";
import { logger } from "@/server/logger";

/**
 * Short link from a program text: verifies the signature, records the click
 * (SmsClick + `sms_click` usage event) and redirects into the app. Signed-out
 * visitors are then sent to the login page by the proxy and come back here.
 */
export async function GET(request: NextRequest, context: RouteContext<"/r/[code]">) {
  const { code } = await context.params;
  const sendId = verifyLinkCode(code);
  let path = "/";
  if (sendId) {
    try {
      const click = await recordClick(sendId);
      if (click) path = click.path;
    } catch (error) {
      logger.error({ err: (error as Error).message }, "sms click failed");
    }
  }
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
