/**
 * Starter copy for the information pages (docs/legacy/06 §3.12). Titles and
 * addresses follow the old site; the text is new, written to be usable as-is
 * and flagged `needsReview` so the study team checks it before launch.
 * `legacyNid` + `aliases` feed the redirects from the old URLs.
 */
export type SeedPage = {
  slug: string;
  title: string;
  summary: string;
  bodyHtml: string;
  order: number;
  inMenu: boolean;
  legacyNid?: number;
  aliases: string[];
};

export const SEED_PAGES: SeedPage[] = [
  {
    slug: "about",
    title: "About Link Positively",
    summary: "What this app is, who it's for and how it works.",
    order: 1,
    inMenu: true,
    legacyNid: 208,
    aliases: ["about"],
    bodyHtml: `
<p>Link Positively is a private community and toolkit for people living with HIV. It's part of a research study that looks at how a supportive app can help people feel connected, stay on top of their health and find the help they need.</p>
<h2>What you can do here</h2>
<ul>
  <li><strong>Connect</strong> with other members on the wall: share how you're doing, cheer each other on and swap tips.</li>
  <li><strong>Learn</strong> from Thrive Tips: short, practical ideas about health, relationships, stigma and everyday life.</li>
  <li><strong>Track</strong> your mood and medicines, and get reminders that fit your routine.</li>
  <li><strong>Find help</strong> nearby with the resource locator: testing, care, food, housing, legal help and more.</li>
</ul>
<h2>Your privacy</h2>
<p>Only study members and the study team can see what's shared here. Other members see your username, avatar, level and what you post, never your contact details or health information. Read <a href="/pages/terms-disclosure">Terms &amp; disclosure</a> for the details.</p>
<h2>Questions?</h2>
<p>Check the <a href="/pages/faq">FAQ</a>, or <a href="/support">contact tech support</a> if something isn't working.</p>`,
  },
  {
    slug: "about-us",
    title: "About us",
    summary: "The research team behind Link Positively.",
    order: 2,
    inMenu: true,
    legacyNid: 429,
    aliases: ["about-us"],
    bodyHtml: `
<p>Link Positively was created by a team of researchers, clinicians, designers and community members, including people living with HIV, who believe that support and good information should be easy to reach.</p>
<p>The study is reviewed and approved by an Institutional Review Board (IRB), which makes sure research protects the rights and wellbeing of the people taking part.</p>
<h2>Who does what</h2>
<ul>
  <li><strong>Study coordinators</strong> answer your questions about the study, your account and your study payments.</li>
  <li><strong>Moderators</strong> keep the community safe and welcoming, following the <a href="/pages/community-guidelines">community guidelines</a>.</li>
  <li><strong>Peer navigators</strong> work one-on-one with members of the Peer Navigation program.</li>
</ul>
<p>Want to reach us? See <a href="/pages/feedback-contact">Feedback &amp; contact</a>.</p>`,
  },
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "A quick tour of the app for your first week.",
    order: 3,
    inMenu: true,
    legacyNid: 416,
    aliases: ["getting-started-with-twm"],
    bodyHtml: `
<p>Welcome! Here's how to make Link Positively your own in a few minutes.</p>
<h2>1. Set up your profile</h2>
<p>Pick an avatar and write a line or two about yourself. You don't need to use your real name. Completing your profile earns you points.</p>
<h2>2. Say hello on the wall</h2>
<p>Share how your day is going, react to other members' posts with an emoji, or leave a kind comment. Read the <a href="/pages/community-guidelines">community guidelines</a> first; reading them earns you points too.</p>
<h2>3. Explore your tips</h2>
<p>New Thrive Tips arrive regularly. Save the ones you like with the heart so you can find them again.</p>
<h2>4. Check in with your tracker</h2>
<p>Log your mood and whether you took your medicine today. You can choose reminders by text message or in the app.</p>
<h2>5. Find resources near you</h2>
<p>Use <a href="/resources">Resources</a> to find clinics, food, housing and support services close to home.</p>
<h2>Levels and points</h2>
<p>Most things you do here earn points. As you level up you unlock new avatars, badges and colour themes.</p>`,
  },
  {
    slug: "faq",
    title: "Frequently asked questions",
    summary: "Answers to common questions about the app and the study.",
    order: 4,
    inMenu: true,
    legacyNid: 207,
    aliases: ["faq"],
    bodyHtml: `
<h2>Who can see what I post?</h2>
<p>Only members of the study and the study team. Other members see your username, avatar, level and the posts and comments you share. They never see your email, phone number or health information.</p>
<h2>Do I have to use my real name?</h2>
<p>No. Choose any username you're comfortable with.</p>
<h2>How do I earn points?</h2>
<p>You earn points for taking part: posting, commenting, reacting, reading tips, checking in with your tracker, rating resources and more. See <a href="/levels">Levels &amp; points</a> for the full list.</p>
<h2>Why am I getting text messages?</h2>
<p>The study sends a few short reminders each week about new tips and check-ins. You can change tracker reminders in your profile. To stop study texts, contact the study team.</p>
<h2>I forgot my password.</h2>
<p>Use "Forgot password" on the sign-in page. If you don't have an email address on file, contact the study team and they'll help you reset it.</p>
<h2>Something isn't working.</h2>
<p>Send a message to <a href="/support">tech support</a> and tell us what happened. We'll get back to you.</p>
<h2>What if I see a post that upsets me?</h2>
<p>Tap "Report" on the post or comment. A moderator will review it. If you're in crisis, see <a href="/pages/help">Get help</a>.</p>`,
  },
  {
    slug: "help",
    title: "Get help",
    summary: "Where to turn when you need support right now.",
    order: 5,
    inMenu: true,
    legacyNid: 204,
    aliases: ["help"],
    bodyHtml: `
<p><strong>If you are in danger or having a medical emergency, call 911.</strong></p>
<h2>Talk to someone now</h2>
<ul>
  <li><strong>988 Suicide &amp; Crisis Lifeline</strong>: call or text <a href="tel:988">988</a>, any time, day or night.</li>
  <li><strong>Crisis Text Line</strong>: text HOME to <a href="sms:741741">741741</a>.</li>
  <li><strong>National Domestic Violence Hotline</strong>: call <a href="tel:18007997233">1-800-799-7233</a> or text START to 88788.</li>
  <li><strong>Trans Lifeline</strong>: call <a href="tel:18775658860">1-877-565-8860</a>.</li>
</ul>
<h2>Help with HIV care</h2>
<p>Your HIV care team is your best first call for questions about medicine, side effects or test results. For services near you (testing, PrEP, food, housing, legal help), use the <a href="/resources">resource locator</a>.</p>
<h2>Help with the study or the app</h2>
<p>Questions about the study: see <a href="/pages/feedback-contact">Feedback &amp; contact</a>. App problems: <a href="/support">contact tech support</a>.</p>`,
  },
  {
    slug: "community-guidelines",
    title: "Community guidelines",
    summary: "How we keep this a safe, kind space for everyone.",
    order: 6,
    inMenu: true,
    legacyNid: 271,
    aliases: ["community-guidelines"],
    bodyHtml: `
<p>Link Positively works because members look out for each other. These guidelines help keep it a place where everyone feels safe to be themselves.</p>
<h2>Be kind and respectful</h2>
<p>Disagree with ideas, not people. No insults, bullying, hate speech or harassment, including about anyone's HIV status, race, gender, sexuality, body, religion or background.</p>
<h2>Protect privacy, yours and others'</h2>
<ul>
  <li>Don't share anyone else's name, photos, health information or story without their permission.</li>
  <li>Think before sharing details that could identify you, like your full name, address or workplace.</li>
  <li>What's shared here stays here. Don't screenshot or repost other members' posts.</li>
</ul>
<h2>Share experiences, not medical advice</h2>
<p>Talking about what works for you is great. But everyone's body and treatment are different, so please don't tell others to stop or change their medicine. Talk to your care team about medical decisions.</p>
<h2>Keep it safe</h2>
<ul>
  <li>No selling, advertising, or asking for money.</li>
  <li>No sexually explicit images.</li>
  <li>Use a content warning (CW) for posts about difficult topics like violence, self-harm or loss.</li>
</ul>
<h2>If something's wrong</h2>
<p>Use "Report" on any post or comment. Moderators review every report and may remove content or pause accounts that break these guidelines. If you or someone else may be in danger, see <a href="/pages/help">Get help</a>.</p>
<p>Thanks for helping make this community a good place to be.</p>`,
  },
  {
    slug: "terms-disclosure",
    title: "Terms & disclosure",
    summary: "The terms of using the app and how your information is handled.",
    order: 7,
    inMenu: true,
    legacyNid: 163,
    aliases: ["terms-disclosure"],
    bodyHtml: `
<p>Link Positively is part of a research study. By using the app you agree to these terms, which work alongside the consent form you signed when you joined.</p>
<h2>Your information</h2>
<ul>
  <li>We collect what you enter (posts, comments, tracker check-ins, survey answers) and how you use the app (for example, which pages you visit), to understand how the app helps.</li>
  <li>Research data is stored securely and reported only in summary form. Your name is never used in study results.</li>
  <li>Your contact details are used only to reach you about the study: reminders, surveys and payments.</li>
</ul>
<h2>What other members see</h2>
<p>Other members can see your username, avatar, level, badges, "About me" and what you post. They cannot see your email, phone number, study ID or health information.</p>
<h2>Not a substitute for medical care</h2>
<p>Content in this app is for information and support. It isn't medical advice. Always talk to your health care provider about your care.</p>
<h2>Leaving the study</h2>
<p>You can stop taking part at any time. Contact the study team and they'll close your account. Your choice won't affect your health care.</p>
<h2>Questions</h2>
<p>For questions about your rights as a research participant, contact the study team or the Institutional Review Board listed on your consent form.</p>`,
  },
  {
    slug: "feedback-contact",
    title: "Feedback & contact",
    summary: "Reach the study team or tell us what you think.",
    order: 8,
    inMenu: true,
    legacyNid: 206,
    aliases: ["feedback-contact"],
    bodyHtml: `
<p>We'd love to hear from you, whether it's an idea, a question or something that could be better.</p>
<h2>App problems</h2>
<p>If something isn't working, the fastest way to get help is the <a href="/support">tech support form</a>. Tell us what you were doing and what happened.</p>
<h2>Questions about the study</h2>
<p>Contact your study coordinator using the phone number or email address on your consent form. They can help with your account, study visits and payments.</p>
<h2>Ideas and feedback</h2>
<p>Tell us what you like and what you'd change using the <a href="/support">support form</a> (choose "Something else"). Every message is read by the team.</p>`,
  },
  {
    slug: "support",
    title: "Support",
    summary: "Help with your account, the app and the study.",
    order: 9,
    inMenu: false,
    legacyNid: 222,
    aliases: ["about/support"],
    bodyHtml: `
<p>Need a hand? Here's where to go.</p>
<ul>
  <li><strong>Trouble signing in or using the app:</strong> send a message through <a href="/support">tech support</a>.</li>
  <li><strong>Questions about the study:</strong> see <a href="/pages/feedback-contact">Feedback &amp; contact</a>.</li>
  <li><strong>Support right now:</strong> see <a href="/pages/help">Get help</a> for crisis lines and services.</li>
  <li><strong>How things work:</strong> read the <a href="/pages/faq">FAQ</a> and <a href="/pages/getting-started">Getting started</a>.</li>
</ul>`,
  },
  {
    slug: "research-study",
    title: "This is a research study",
    summary: "Shown on the sign-in and password pages.",
    order: 10,
    inMenu: false,
    legacyNid: 209,
    aliases: [],
    bodyHtml: `
<p>Link Positively is part of a research study. Access is limited to people enrolled in the study and the study team. If you think you should have access, contact your study coordinator.</p>`,
  },
];
