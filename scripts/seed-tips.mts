/**
 * Sample Thrive Tips, topics and categories for local testing (never run in
 * production). Tip texts are written for the rewrite as samples — the real
 * content is migrated from Drupal. Topic and category names are the site's
 * own taxonomy (docs/legacy/01 §4.1.2–4.1.3).
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-tips.mts
 *
 * Also gives the local "participant" and "both" accounts a study start date
 * (12 days ago) and sample tailoring scores when they have none, so Your Tips
 * has something to show.
 */
import { and, eq } from "drizzle-orm";
import { db, pgClient } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { profiles } from "@/server/db/schema/profiles";
import { tips, tipTags, type TailoringRule, type TipTemplate } from "@/server/db/schema/tips";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const TAGS = [
  "Adherence",
  "ART",
  "Ask Your Provider",
  "Couples Communication",
  "Crisis",
  "Depression",
  "Disclosure",
  "Discrimination",
  "Everyone Has a Story",
  "Exercise",
  "Get Support",
  "Health",
  "Healthy Eating",
  "HIV",
  "Love",
  "Medical Mistrust",
  "Medication",
  "Meditation",
  "Mental Health",
  "Patient-Provider Communication",
  "PrEP",
  "Prevention",
  "Relationships",
  "Resilience",
  "Resources",
  "Safe Sex",
  "Self-care",
  "Sleep",
  "Stigma",
  "STIs",
  "Substance Use",
  "Testimonial",
  "Treatment",
  "Undetectable",
  "Video",
  "Wellness",
  "Women with HIV",
];

const CATEGORIES = [
  "Learn more about how HIV medications work and how to get the information you want about HIV",
  "Learn more about how to get more support from others",
  "Learn more about how to take your medications as prescribed and what to do when you miss doses",
  "Learn more about how your medications interact with drugs and alcohol",
  "Learn more about ways to make taking your medication part of your daily life and feel less frustrated",
  "Learn more about why it is important to take your medications for your short and long-term health",
  "Learn more ways to feel better about your HIV and your HIV medications",
];

type SampleTip = {
  title: string;
  day: number;
  dayTwo?: number;
  tags: string[];
  category?: number;
  type?: "html" | "video" | "pdf" | "offsite";
  template?: string;
  html: string;
  description?: string;
  pullquote?: string;
  videoUrl?: string;
  link?: string;
  rule?: { field: string; operator: string; value: number };
};

const TIPS: SampleTip[] = [
  {
    title: "Pair your pills with something you already do",
    day: 1,
    dayTwo: 12,
    tags: ["Adherence", "Medication"],
    category: 4,
    html: "<p>Habits stick best when they ride along with something you never forget. Try keeping your medication next to your toothbrush, your coffee maker or your phone charger.</p><ul><li>Pick one daily routine that happens at about the same time.</li><li>Put your pills where you'll see them during that routine.</li><li>Give it two weeks — that's usually when it starts to feel automatic.</li></ul>",
    rule: { field: "b1", operator: "<", value: 4 },
  },
  {
    title: "Undetectable means untransmittable",
    day: 1,
    dayTwo: 3,
    tags: ["Undetectable", "Treatment", "HIV"],
    category: 5,
    template: "text_blockquote",
    pullquote: "When your viral load stays undetectable, you can't pass HIV to a partner through sex.",
    html: "<p>Taking your HIV medication every day can lower the amount of virus in your blood until a test can't measure it. That's called being <strong>undetectable</strong>.</p><p>Staying undetectable protects your own health <em>and</em> means HIV isn't transmitted through sex. Ask your provider how often you should check your viral load.</p>",
  },
  {
    title: "What to do if you miss a dose",
    day: 2,
    dayTwo: 20,
    tags: ["Adherence", "Ask Your Provider", "Medication"],
    category: 2,
    template: "text_bullet",
    html: "<p>Everyone misses a dose now and then. What matters is what you do next.</p><ul><li>If you remember soon after, take it as soon as you can.</li><li>If it's almost time for your next dose, skip the missed one — <strong>don't double up</strong>.</li><li>Missing doses often? Tell your provider. There may be a simpler plan that fits your life better.</li></ul>",
    rule: { field: "i2", operator: "<", value: 5 },
  },
  {
    title: "A two-minute breathing reset",
    day: 2,
    dayTwo: 44,
    tags: ["Meditation", "Mental Health", "Self-care"],
    category: 6,
    html: "<p>When your thoughts are racing, try box breathing:</p><ol><li>Breathe in slowly for four counts.</li><li>Hold for four.</li><li>Breathe out for four.</li><li>Hold for four, then repeat.</li></ol><p>Four rounds is enough to calm your body down. You can do it anywhere — on the bus, in a waiting room, before a hard conversation.</p>",
  },
  {
    title: "Write your questions down before appointments",
    day: 3,
    dayTwo: 7,
    tags: ["Patient-Provider Communication", "Ask Your Provider"],
    category: 0,
    html: "<p>Appointments go fast, and it's easy to forget what you wanted to ask. Keep a running note on your phone during the week.</p><p>Good things to bring up: side effects, how you're sleeping, your mood, and anything that makes taking your medication hard.</p>",
    rule: { field: "i5", operator: "<=", value: 3 },
  },
  {
    title: "Your story, your timing",
    day: 3,
    dayTwo: 31,
    tags: ["Disclosure", "Relationships", "Stigma"],
    category: 1,
    template: "text_linequote",
    pullquote: "You get to decide who you tell, when, and how much.",
    html: "<p>Sharing your status can bring you closer to people — and it's also personal. There's no deadline.</p><p>If you're thinking about telling someone, it can help to practise with a person you already trust, or with your peer navigator.</p>",
  },
  {
    title: "Why every dose counts",
    day: 4,
    dayTwo: 2,
    tags: ["ART", "Treatment", "Adherence"],
    category: 5,
    type: "video",
    template: "video_text",
    description: "A short explainer on how daily treatment keeps HIV under control. (Sample video for local testing.)",
    videoUrl: "https://vimeo.com/76979871",
    html: "<p>HIV medication works by stopping the virus from making copies of itself. Taking it every day keeps the level of medication in your body steady, so the virus doesn't get a chance to bounce back.</p>",
  },
  {
    title: "Sleep is part of your treatment plan",
    day: 4,
    dayTwo: 55,
    tags: ["Sleep", "Wellness", "Self-care"],
    category: 6,
    html: "<p>Good sleep helps your immune system, your mood and your memory — including remembering your meds.</p><ul><li>Try to go to bed and wake up at about the same time.</li><li>Put screens away 30 minutes before bed.</li><li>Keep caffeine to the morning.</li></ul>",
  },
  {
    title: "You don't have to do this alone",
    day: 5,
    dayTwo: 9,
    tags: ["Get Support", "Mental Health", "Resources"],
    category: 1,
    html: "<p>Support can look like a friend who texts you a reminder, a support group, a counsellor or a peer navigator who's been where you are.</p><p>Think of one person you could reach out to this week. A short message is enough to start.</p>",
    rule: { field: "m3", operator: "<", value: 3 },
  },
  {
    title: "Alcohol, other drugs and your meds",
    day: 5,
    dayTwo: 16,
    tags: ["Substance Use", "Medication", "Ask Your Provider"],
    category: 3,
    html: "<p>Most HIV medications are safe to take even if you've been drinking or using. <strong>Skipping a dose is usually riskier than taking it.</strong></p><p>Be honest with your provider about what you use — they're there to help you stay healthy, not to judge.</p>",
    rule: { field: "b7", operator: ">=", value: 3 },
  },
  {
    title: "Move in a way you enjoy",
    day: 6,
    dayTwo: 27,
    tags: ["Exercise", "Wellness", "Health"],
    html: "<p>Exercise doesn't have to mean a gym. Dancing in your kitchen, a walk with a friend or stretching while you watch TV all count.</p><p>Aim for a little movement most days. Your heart, bones and mood will thank you.</p>",
  },
  {
    title: "Stigma is not your fault",
    day: 6,
    dayTwo: 38,
    tags: ["Stigma", "Discrimination", "Resilience"],
    category: 6,
    template: "text_blockquote",
    pullquote: "Living with HIV says nothing about your worth.",
    html: "<p>Hurtful comments and unfair treatment come from fear and outdated information — not from anything you did.</p><p>If you've been treated unfairly because of your status, you have rights. Your peer navigator can help you find legal and advocacy resources.</p>",
  },
  {
    title: "Set a backup reminder",
    day: 7,
    dayTwo: 5,
    tags: ["Adherence", "Medication"],
    category: 4,
    html: "<p>Phone alarms are great — until your phone dies. Set up a second reminder that doesn't depend on it: a pill box you can see, a note on the fridge, or a check-in from someone you live with.</p>",
    rule: { field: "b2", operator: "<", value: 4 },
  },
  {
    title: "Eat the rainbow (on a budget)",
    day: 7,
    dayTwo: 60,
    tags: ["Healthy Eating", "Wellness"],
    html: "<p>Colourful fruits and vegetables give your body the vitamins it needs to stay strong. Frozen and canned (in water, not syrup) are just as good and often cheaper.</p><p>Try adding one extra colour to one meal a day this week.</p>",
  },
  {
    title: "Talking about safer sex with a partner",
    day: 8,
    dayTwo: 14,
    tags: ["Safe Sex", "Couples Communication", "Relationships", "PrEP"],
    category: 1,
    html: "<p>It can feel awkward at first, but talking openly builds trust. Pick a calm moment — not right before sex.</p><ul><li>Share what you know about U=U and PrEP.</li><li>Ask what your partner needs to feel safe.</li><li>Decide together about condoms and testing for other STIs.</li></ul>",
  },
  {
    title: "Notice your feelings without judging them",
    day: 8,
    dayTwo: 22,
    tags: ["Mental Health", "Meditation", "Depression"],
    category: 6,
    html: '<p>Frustrated, tired, hopeful, numb — all of it is allowed. Naming a feeling ("I\'m feeling overwhelmed") can make it easier to handle.</p><p>If low moods last more than two weeks or get in the way of daily life, please reach out to your provider or a counsellor.</p>',
    rule: { field: "m6", operator: ">", value: 2 },
  },
  {
    title: "Getting ready for your lab results",
    day: 9,
    dayTwo: 33,
    tags: ["Treatment", "Patient-Provider Communication"],
    category: 0,
    template: "text_bullet",
    html: "<p>Two numbers you'll hear a lot:</p><ul><li><strong>Viral load</strong> — how much HIV is in your blood. Lower is better; undetectable is the goal.</li><li><strong>CD4 count</strong> — how strong your immune system is. Higher is better.</li></ul><p>Ask your provider what your numbers mean for you and what the next steps are.</p>",
  },
  {
    title: "Everyone has a story: finding strength in community",
    day: 9,
    dayTwo: 48,
    tags: ["Everyone Has a Story", "Testimonial", "Get Support", "Women with HIV"],
    category: 1,
    html: "<p>Hearing from people who've walked the same road can be powerful. Many people say that connecting with others living with HIV helped them feel less alone and more in control.</p><p>The wall is a good place to start — share a win, a question or just say hi.</p>",
  },
  {
    title: "When things feel like too much",
    day: 10,
    dayTwo: 10,
    tags: ["Crisis", "Mental Health", "Get Support"],
    category: 1,
    html: "<p>If you're thinking about hurting yourself or feel unsafe, you don't have to wait. In the US you can call or text <strong>988</strong> any time to reach the Suicide &amp; Crisis Lifeline. If you're in immediate danger, call 911.</p><p>Reaching out is a sign of strength.</p>",
  },
  {
    title: "Refill before you run out",
    day: 10,
    dayTwo: 40,
    tags: ["Adherence", "Medication", "Resources"],
    category: 4,
    html: "<p>Running out is one of the most common reasons people miss doses. Set a reminder a week before your supply ends, and ask your pharmacy about automatic refills or mail delivery.</p>",
    rule: { field: "b4", operator: "<=", value: 2 },
  },
  {
    title: "PrEP for partners",
    day: 11,
    dayTwo: 26,
    tags: ["PrEP", "Prevention", "Relationships"],
    category: 0,
    type: "offsite",
    description:
      "If your partner is HIV-negative, PrEP is a daily pill (or regular shot) that greatly lowers their chance of getting HIV. Together with U=U, it gives couples even more peace of mind.",
    link: "https://www.cdc.gov/hiv/prevention/prep.html",
    html: "",
  },
  {
    title: "Build trust with your care team",
    day: 11,
    dayTwo: 51,
    tags: ["Medical Mistrust", "Patient-Provider Communication"],
    category: 0,
    html: "<p>Many people have good reasons not to trust the healthcare system. It's okay to ask questions, ask for a second opinion, or bring someone with you to appointments.</p><p>You deserve care that respects you.</p>",
    rule: { field: "m8", operator: ">=", value: 3 },
  },
  {
    title: "Small wins count",
    day: 12,
    dayTwo: 1,
    tags: ["Resilience", "Self-care", "Mental Health"],
    category: 6,
    template: "text_linequote",
    pullquote: "Took your meds today? That's a win worth noticing.",
    html: "<p>Big goals are made of small, everyday choices. At the end of the day, write down one thing you did for your health — however small.</p>",
  },
  {
    title: "Travelling with your medication",
    day: 12,
    dayTwo: 35,
    tags: ["Medication", "Adherence"],
    category: 4,
    html: "<ul><li>Pack medication in your carry-on, not checked luggage.</li><li>Bring a few extra days' worth in case of delays.</li><li>Crossing time zones? Ask your provider how to adjust your dose time.</li></ul>",
  },
  {
    title: "Checking in on STIs",
    day: 13,
    dayTwo: 42,
    tags: ["STIs", "Safe Sex", "Health"],
    category: 0,
    html: "<p>Being undetectable prevents HIV transmission, but it doesn't protect against other STIs. Regular testing — every 3 to 12 months depending on your situation — keeps you and your partners healthy.</p>",
  },
  {
    title: "A kinder way to talk to yourself",
    day: 13,
    dayTwo: 58,
    tags: ["Self-care", "Mental Health", "Stigma"],
    category: 6,
    html: "<p>Would you talk to a friend the way you talk to yourself on a hard day? Try swapping one harsh thought for what you'd say to someone you love.</p>",
  },
  {
    title: "Side effects? Speak up",
    day: 14,
    dayTwo: 18,
    tags: ["Ask Your Provider", "Medication", "ART"],
    category: 2,
    html: "<p>Most side effects are mild and fade after the first few weeks. If something bothers you — trouble sleeping, stomach issues, strange dreams — tell your provider. There are many treatment options, and switching is often possible.</p>",
    rule: { field: "i7", operator: "!=", value: 5 },
  },
  {
    title: "Love and dating with HIV",
    day: 14,
    dayTwo: 64,
    tags: ["Love", "Relationships", "Disclosure"],
    category: 1,
    html: "<p>People living with HIV have loving, healthy relationships every day. Knowing about U=U, PrEP and your own boundaries can make dating feel less scary.</p><p>You are worthy of love and respect — full stop.</p>",
  },
];

// Topics and categories
const tagIds = new Map<string, string>();
for (const [kind, names] of [
  ["tag", TAGS],
  ["category", CATEGORIES],
] as const) {
  for (const name of names) {
    const slug = slugify(name).slice(0, 140);
    await db
      .insert(tipTags)
      .values({ kind, slug, name })
      .onConflictDoNothing({ target: [tipTags.kind, tipTags.slug] });
    const [doc] = await db
      .select({ id: tipTags.id })
      .from(tipTags)
      .where(and(eq(tipTags.kind, kind), eq(tipTags.slug, slug)))
      .limit(1);
    tagIds.set(`${kind}:${name}`, doc.id);
  }
}
console.log(`topics: ${TAGS.length}, categories: ${CATEGORIES.length}`);

let created = 0;
for (const sample of TIPS) {
  const [existing] = await db.select({ id: tips.id }).from(tips).where(eq(tips.title, sample.title)).limit(1);
  if (existing) continue;
  const html = sanitizeStaffHtml(sample.html);
  const tags = sample.tags.map((name) => tagIds.get(`tag:${name}`)).filter((id): id is string => Boolean(id));
  await db.insert(tips).values({
    title: sample.title,
    type: sample.type ?? "html",
    template: sample.template as TipTemplate | undefined,
    html,
    description: sample.description ?? "",
    pullquote: sample.pullquote,
    videoUrl: sample.videoUrl,
    link: sample.link,
    tagIds: tags,
    categoryId: sample.category != null ? tagIds.get(`category:${CATEGORIES[sample.category]}`) : undefined,
    displayDay: sample.day,
    displayDayTwo: sample.dayTwo,
    rule: sample.rule as TailoringRule | undefined,
    published: true,
    searchText: [sample.title, toPlainText(html), sample.description ?? "", sample.tags.join(" ")].join(" "),
  });
  created += 1;
}
console.log(`tips: ${created} created, ${TIPS.length - created} already there`);

// Give the local participants a study start date and sample tailoring scores.
const start = new Date();
start.setDate(start.getDate() - 11);
start.setHours(12, 0, 0, 0);
for (const username of ["participant", "both"]) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!user) continue;
  const tailoring = { b1: 2, i2: 3, i5: 2, m3: 2, b7: 1, m6: 3, b2: 5, b4: 3, m8: 2, i7: 4 };
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!profile) {
    await db.insert(profiles).values({ userId: user.id, interventionStartDate: start, extra: { tailoring } });
    console.log(`profile  ${username}: created with start date`);
    continue;
  }
  const set: { interventionStartDate?: Date; extra?: Record<string, unknown> } = {};
  if (!profile.interventionStartDate) set.interventionStartDate = start;
  if (!profile.extra?.tailoring) set.extra = { ...profile.extra, tailoring };
  if (Object.keys(set).length) {
    await db.update(profiles).set(set).where(eq(profiles.id, profile.id));
    console.log(`profile  ${username}: set ${Object.keys(set).join(", ")}`);
  }
}

await pgClient.end();
process.exit(0);
