import { Button, Text } from "@react-email/components";
import { EmailLayout, emailButton, emailText } from "./layout";

export function ResetPasswordEmail({ url, name }: { url: string; name: string }) {
  return (
    <EmailLayout preview="Reset your password">
      <Text style={emailText}>Hi {name},</Text>
      <Text style={emailText}>
        Someone asked to reset the password for your account. Use the button below to choose a new one. The link works
        once and expires in 24 hours.
      </Text>
      <Button href={url} style={emailButton}>
        Choose a new password
      </Button>
      <Text style={{ ...emailText, fontSize: 13, color: "#8a7888" }}>
        If you didn&apos;t ask for this, you can ignore this email. Your password won&apos;t change.
      </Text>
    </EmailLayout>
  );
}
