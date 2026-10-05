import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

/** Shared frame for all transactional emails. Keep content free of health details. */
export function EmailLayout({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f7f3f7", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 16, maxWidth: 520, padding: "32px 36px" }}>
          <Text style={{ color: "#682F7C", fontSize: 18, fontWeight: 700, margin: "0 0 24px" }}>Link Positively</Text>
          {children}
          <Section style={{ borderTop: "1px solid #eee4ee", marginTop: 32, paddingTop: 16 }}>
            <Text style={{ color: "#8a7888", fontSize: 12, lineHeight: "18px", margin: 0 }}>
              You are receiving this because you have an account with a research study. If this wasn&apos;t you, you
              can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailText = { color: "#3B0030", fontSize: 15, lineHeight: "24px" } as const;
export const emailButton = {
  backgroundColor: "#682F7C",
  borderRadius: 999,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 22px",
  textDecoration: "none",
} as const;
