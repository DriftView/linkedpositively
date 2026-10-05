import { Button, Text } from "@react-email/components";
import { EmailLayout, emailButton, emailText } from "@/server/emails/layout";

/**
 * Sent to every active coordinator when a participant suggests a resource
 * (old subject "LinkPositively: Resource Created by a user"). No participant
 * details, only the place's name.
 */
export function ResourceSuggestedEmail({ title, city, reviewUrl }: { title: string; city?: string; reviewUrl: string }) {
  return (
    <EmailLayout preview="A new resource is waiting for review">
      <Text style={emailText}>Hello,</Text>
      <Text style={emailText}>
        A member suggested a new resource for the resource locator: <strong>{title}</strong>
        {city ? ` (${city})` : ""}. It stays hidden until a coordinator reviews and publishes it.
      </Text>
      <Button href={reviewUrl} style={emailButton}>
        Review suggested resources
      </Button>
    </EmailLayout>
  );
}
