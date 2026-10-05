import { Button, Text } from "@react-email/components";
import { EmailLayout, emailButton, emailText } from "./layout";

/**
 * Sent when a control account is converted to the intervention ("Convert
 * Control User(s) to Participant(s)"; Drupal sent its account email here).
 * When the person has never set a password, `url` is a set-password link.
 */
export function AccountReadyEmail({
  url,
  name,
  studyName,
  needsPassword,
  contactEmail,
}: {
  url: string;
  name: string;
  studyName: string;
  needsPassword: boolean;
  contactEmail?: string;
}) {
  return (
    <EmailLayout preview={`Your ${studyName} account is ready`}>
      <Text style={emailText}>Hi {name},</Text>
      <Text style={emailText}>
        Good news — your {studyName} account is set up and ready to go. Over the next few months you&apos;ll find tips,
        a supportive community and tools to keep track of what matters to you. We&apos;ll also send you a short text each
        week.
      </Text>
      <Button href={url} style={emailButton}>
        {needsPassword ? "Set up my password" : "Open " + studyName}
      </Button>
      <Text style={{ ...emailText, fontSize: 13, color: "#8a7888" }}>
        {needsPassword ? "This link works once and expires in 7 days. " : ""}
        {contactEmail ? `Questions? Write to ${contactEmail}.` : ""}
      </Text>
    </EmailLayout>
  );
}
