import { describe, expect, it } from "vitest";
import { buildMemberContext, conversationTitle, speakableText, type MemberContext } from "./prompt";

const base: MemberContext = {
  personalize: true,
  firstName: "Sam",
  pronouns: "they/them",
  location: "Atlanta, GA",
  timezone: "America/New_York",
  linkPositively: true,
  peerNavigation: true,
  navigatorName: "Jordan",
  today: "Tuesday, October 6, 2026",
};

describe("buildMemberContext", () => {
  it("includes profile details when personalization is on", () => {
    const note = buildMemberContext(base);
    expect(note).toContain("First name: Sam.");
    expect(note).toContain("Pronouns: they/them.");
    expect(note).toContain("Atlanta, GA");
    expect(note).toContain("Has a peer navigator: Jordan.");
    expect(note).toContain("Link Positively and Peer Navigation");
  });

  it("leaves out personal details when personalization is off", () => {
    const note = buildMemberContext({ ...base, personalize: false });
    expect(note).not.toContain("Sam");
    expect(note).not.toContain("they/them");
    expect(note).not.toContain("Atlanta");
    expect(note).toContain("turned off personalization");
  });

  it("explains the navigator situation", () => {
    expect(buildMemberContext({ ...base, navigatorName: null })).toContain("not matched with a navigator yet");
    expect(buildMemberContext({ ...base, peerNavigation: false })).toContain("study team instead");
  });
});

describe("conversationTitle", () => {
  it("keeps short questions whole", () => {
    expect(conversationTitle("  Where can I get   tested? ")).toBe("Where can I get tested?");
  });

  it("cuts long questions on a word boundary", () => {
    const title = conversationTitle("I have a question about PrEP and whether it works if I miss a dose sometimes on weekends");
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
  });
});

describe("speakableText", () => {
  it("drops markdown markers", () => {
    expect(speakableText("**PrEP** works.\n\n- Take it daily\n- See a provider")).toBe("PrEP works.\nTake it daily\nSee a provider");
  });
});
