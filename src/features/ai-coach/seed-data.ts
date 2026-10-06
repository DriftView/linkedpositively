import type { AiTopic } from "@/server/db/schema/ai";

/**
 * Starter AI Coach knowledge articles. DRAFTS: written from public CDC
 * guidance for the study team to review, edit and approve in
 * /admin/ai/knowledge. The seed script creates them unpublished and flagged
 * "needs review" (pass --publish for local testing only).
 */
export const SEED_AI_ARTICLES: { title: string; topic: AiTopic; sourceUrl: string; body: string }[] = [
  {
    title: "PrEP: medicine that prevents HIV",
    topic: "prep",
    sourceUrl: "https://www.cdc.gov/hiv/prevention/prep.html",
    body: `PrEP (pre-exposure prophylaxis) is medicine taken to prevent getting HIV. It is for people who do not have HIV and who could be exposed to it through sex or injection drug use.

When taken as prescribed, PrEP is highly effective. It reduces the risk of getting HIV from sex by about 99%, and from injection drug use by at least 74%.

PrEP comes as a daily pill or as a shot given every two months. A health care provider can help someone choose the option that fits their life.

PrEP needs a prescription and regular check-ins with a provider, including HIV testing. PrEP does not protect against other sexually transmitted infections, so condoms still help with those.

Many people can get PrEP at low or no cost through insurance or assistance programs. A peer navigator can help with finding a provider and with costs.`,
  },
  {
    title: "PEP: emergency medicine after a possible HIV exposure",
    topic: "pep",
    sourceUrl: "https://www.cdc.gov/hiv/prevention/pep.html",
    body: `PEP (post-exposure prophylaxis) is medicine taken after a possible exposure to HIV to prevent HIV. It is for emergencies, for example after condomless sex with someone whose HIV status is unknown, a broken condom, sharing needles, or sexual assault.

PEP must be started within 72 hours (3 days) of a possible exposure. The sooner it is started, the better it works. Every hour counts.

PEP means taking HIV medicines every day for 28 days, with follow-up HIV testing.

To get PEP, contact a health care provider right away, or go to an urgent care center or an emergency room. Someone who might have been exposed should not wait for a regular appointment.

PEP is not meant for regular use. People who might be exposed to HIV often can ask a provider about PrEP.`,
  },
  {
    title: "Getting tested for HIV",
    topic: "testing",
    sourceUrl: "https://www.cdc.gov/hiv/testing/index.html",
    body: `Testing is the only way to know your HIV status. CDC recommends that everyone between 13 and 64 get tested at least once, and that people with ongoing risk get tested at least once a year. Some sexually active gay and bisexual men may benefit from testing every 3 to 6 months.

HIV tests are available at clinics, health departments, community organizations and some pharmacies. Self-tests can be done at home, and many places offer free tests. The resource locator in Link Positively can help find testing nearby.

No test can detect HIV immediately after an exposure. If someone thinks they were exposed in the last 72 hours, PEP may prevent HIV, and they should get care right away.

A positive result on a rapid test or self-test needs a follow-up test from a provider. If the result is positive, treatment and support are available, and people living with HIV who take treatment can live long, healthy lives.`,
  },
  {
    title: "Undetectable = Untransmittable (U=U)",
    topic: "treatment",
    sourceUrl: "https://www.cdc.gov/hiv/prevention/treatment-as-prevention.html",
    body: `HIV treatment (antiretroviral therapy, or ART) lowers the amount of HIV in the body, called the viral load.

People with HIV who take HIV medicine as prescribed and get and keep an undetectable viral load have effectively no risk of transmitting HIV to their sex partners. This is often called U=U: undetectable equals untransmittable.

Staying in care, taking medicine as prescribed and getting regular viral load tests are how people know their viral load stays undetectable. A provider or peer navigator can help with staying on treatment.`,
  },
  {
    title: "When stress, sadness or worry feels like too much",
    topic: "mental_health",
    sourceUrl: "https://988lifeline.org/",
    body: `Feeling stressed, sad, anxious or overwhelmed is common, and it is okay to ask for help. Talking with someone you trust, a peer navigator, a counselor or a health care provider can help.

Small steps can help on hard days: getting some sleep, eating something, moving your body, spending time outside, connecting with a friend, or writing down what you feel.

If you are thinking about suicide or feel you might hurt yourself, you can call or text 988 at any time to reach the Suicide & Crisis Lifeline. You can also text HOME to 741741. If you are in immediate danger, call 911.

The resource locator in Link Positively can help find mental health support nearby.`,
  },
];
