import { AudioLines, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getVoiceHealth, type VoiceOutageReason } from "../../voice-status";

/** Credits left (share of the period's allowance) that starts the "running low" warning. */
const LOW_SHARE = 0.2;

const OUTAGE_TEXT: Record<VoiceOutageReason, string> = {
  out_of_credits: "it's out of credits",
  rejected_key: "it rejected the API key",
  unavailable: "it isn't responding",
};

/**
 * ElevenLabs (the coach's voice) for admins: shown only when something needs
 * attention, i.e. it is failing right now, out of credits, or running low.
 * `showCheckErrors` also says when the credits couldn't be checked (the AI
 * Coach page; the dashboard stays quiet about that).
 */
export async function VoiceStatusBanner({
  timezone,
  showCheckErrors = false,
}: {
  timezone: string;
  showCheckErrors?: boolean;
}) {
  const health = await getVoiceHealth();
  if (!health) return null;
  const date = (value: Date, withTime = false) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
      timeZone: timezone,
    }).format(value);

  const credits = health.credits;
  const left = credits ? Math.max(0, credits.limit - credits.used) : null;
  const exhausted = Boolean(credits && !credits.payAsYouGo && left === 0);
  const low = Boolean(credits && !credits.payAsYouGo && credits.limit > 0 && left! / credits.limit < LOW_SHARE);
  const resets = credits?.resetsAt ? ` They reset on ${date(credits.resetsAt)}.` : "";
  const fallbackNote =
    "Until it's back, the coach reads replies with the browser's built-in voice, the video coach is silent, and voice chat may not understand members.";

  if (health.outage || exhausted) {
    const why = health.outage ? OUTAGE_TEXT[health.outage.reason] : OUTAGE_TEXT.out_of_credits;
    const since = health.outage ? ` since ${date(health.outage.since, true)}` : "";
    return (
      <Alert variant="destructive" className="mb-5 rounded-2xl">
        <TriangleAlert aria-hidden />
        <AlertTitle>The coach&apos;s voice (ElevenLabs) isn&apos;t working</AlertTitle>
        <AlertDescription>
          ElevenLabs has been skipped{since} because {why}. {fallbackNote}
          {exhausted || health.outage?.reason === "out_of_credits"
            ? ` Add credits or turn on usage-based billing in ElevenLabs.${resets}`
            : " It's tried again every few minutes."}
        </AlertDescription>
      </Alert>
    );
  }

  if (low && credits) {
    const share = Math.round((left! / credits.limit) * 100);
    return (
      <Alert className="mb-5 rounded-2xl">
        <AudioLines aria-hidden />
        <AlertTitle>ElevenLabs credits are running low</AlertTitle>
        <AlertDescription>
          {share}% left ({left!.toLocaleString("en-US")} of {credits.limit.toLocaleString("en-US")}).{resets} When they run
          out, the coach falls back to the browser&apos;s built-in voice. Add credits or turn on usage-based billing in
          ElevenLabs.
        </AlertDescription>
      </Alert>
    );
  }

  if (showCheckErrors && health.creditsError) {
    return (
      <Alert className="mb-5 rounded-2xl">
        <AudioLines aria-hidden />
        <AlertTitle>Couldn&apos;t check ElevenLabs credits</AlertTitle>
        <AlertDescription>{health.creditsError}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
