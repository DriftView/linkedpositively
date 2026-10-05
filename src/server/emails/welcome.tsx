import { Button, Text } from "@react-email/components";
import { EmailLayout, emailButton, emailText } from "./layout";

/**
 * Sent when staff create an account ("Create a new participant") or re-send
 * the welcome link. Replaces Drupal's "register_no_approval_required" email,
 * which contained the password in plain text: the link lets the person choose
 * their own password instead.
 */
export function WelcomeEmail({
  url,
  name,
  username,
  studyName,
  contactEmail,
  expiresInDays,
}: {
  url: string;
  name: string;
  username: string;
  studyName: string;
  contactEmail?: string;
  expiresInDays: number;
}) {
  return (
    <EmailLayout preview={`Welcome to ${studyName} — set up your password`}>
      <Text style={emailText}>Hi {name},</Text>
      <Text style={emailText}>
        Your {studyName} account is ready. Your username is <strong>{username}</strong>. Choose a password to finish
        setting it up.
      </Text>
      <Button href={url} style={emailButton}>
        Set up my password
      </Button>
      <Text style={{ ...emailText, fontSize: 13, color: "#8a7888" }}>
        This link works once and expires in {expiresInDays} days. If it has expired, use “Forgot password” on the sign-in
        page.
        {contactEmail ? ` Questions? Write to ${contactEmail}.` : ""}
      </Text>
    </EmailLayout>
  );
}
