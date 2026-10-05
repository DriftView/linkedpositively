import { NextResponse, type NextRequest } from "next/server";
import { openSurvey } from "@/features/surveys/service";
import { getViewer } from "@/server/auth/session";
import { SURVEY_KEYS, type SurveyKey } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";

/**
 * "Take the survey": records the open (usage event `survey_open`) and sends
 * the participant to the Qualtrics form with `?ID=<study id>`.
 */
export async function GET(request: NextRequest, context: RouteContext<"/surveys/[key]/go">) {
  const { key } = await context.params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL(`/login?next=/surveys`, request.nextUrl.origin));
  if (!(SURVEY_KEYS as readonly string[]).includes(key))
    return NextResponse.redirect(new URL("/surveys", request.nextUrl.origin));
  const url = await openSurvey({ id: viewer.id, name: viewer.name, timezone: viewer.timezone }, key as SurveyKey);
  if (!url) return NextResponse.redirect(new URL("/surveys", request.nextUrl.origin));
  await trackUsage(viewer.id, "survey_open", { survey: key });
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
