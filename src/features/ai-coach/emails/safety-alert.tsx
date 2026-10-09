import { Button, Text } from "@react-email/components";
import { EmailLayout, emailButton, emailText } from "@/server/emails/layout";

/**
 * Sent to the study's safety contact when an AI Coach conversation needs a
 * person. Deliberately carries no member name and no message content: staff
 * sign in to see the conversation.
 */
export function SafetyAlertEmail({
  url,
  level,
  studyName,
}: {
  url: string;
  level: "support" | "elevated" | "urgent";
  studyName: string;
}) {
  const heading =
    level === "urgent"
      ? "An urgent AI Coach safety alert needs review now."
      : level === "elevated"
        ? "An AI Coach conversation was flagged for a safety review."
        : "A member asked the AI Coach to talk to a person.";
  return (
    <EmailLayout preview={heading}>
      <Text style={emailText}>{heading}</Text>
      <Text style={emailText}>
        Sign in to {studyName} to see the conversation and follow your study&apos;s safety protocol. The member has been
        shown crisis lines in the app where relevant.
      </Text>
      <Button href={url} style={emailButton}>
        Review the alert
      </Button>
    </EmailLayout>
  );
}
