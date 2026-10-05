/**
 * Sample weekly check-in prompts for local testing (never run in production).
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-checkin.mts
 *
 * The study's real prompt wording lived only in the Drupal database, so these
 * are SAMPLE prompts, labelled as such in their titles; the migration (or
 * staff at /admin/content/check-in) replaces them.
 *
 * Also fills the local "participant" and "both" accounts' daily tracker
 * check-ins for their first two study weeks (only days with no entry), so the
 * week table has something to show.
 */
import { eq } from "drizzle-orm";
import { db, pgClient } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { checkinPrompts, dailyCheckins } from "@/server/db/schema/checkin";
import { profiles } from "@/server/db/schema/profiles";
import { dayKey } from "@/lib/dates";
import { studyDayStart } from "@/features/tips/schedule";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const AGREE = ["Not at all", "A little", "Somewhat", "Quite a bit", "Very much"];
const FREQUENCY = ["Never", "Rarely", "Sometimes", "Often", "Always"];

const PROMPTS = [
  {
    theme: "Getting started",
    likertText: "How confident do you feel about taking your medication every day?",
    options: AGREE,
    openText: "What's one thing that helped you this week?",
    openPlaceholder: "A person, a routine, a reminder…",
  },
  {
    theme: "Routines",
    likertText: "How often did your daily routine make it easy to take your medication?",
    options: FREQUENCY,
    openText: "Was there a moment this week when taking your medication felt hard? What was going on?",
    openPlaceholder: "Write as much or as little as you like",
  },
  {
    theme: "Support",
    likertText: "How supported did you feel by the people around you this week?",
    options: AGREE,
    openText: "Who is someone you could lean on next week?",
    openPlaceholder: "A friend, family member, your peer navigator…",
  },
  {
    theme: "Mood",
    likertText: "How well were you able to handle stress this week?",
    options: AGREE,
    openText: "What's one small thing you did to take care of yourself?",
    openPlaceholder: "Even a short walk counts",
  },
  {
    theme: "Talking with your provider",
    likertText: "How comfortable do you feel asking your provider questions?",
    options: AGREE,
    openText: "Is there a question you'd like to ask at your next appointment?",
    openPlaceholder: "Write it here so you don't forget",
  },
  {
    theme: "Missed doses",
    likertText: "How sure are you about what to do if you miss a dose?",
    options: AGREE,
    openText: "What gets in the way of taking your medication on time?",
    openPlaceholder: "Work, travel, sleep, running out…",
  },
  {
    theme: "Feeling good about treatment",
    likertText: "How good do you feel about your HIV treatment right now?",
    options: AGREE,
    openText: "What would make taking your medication easier or more positive for you?",
    openPlaceholder: "Anything goes",
  },
  {
    theme: "Alcohol and other drugs",
    likertText: "How often did alcohol or other drugs affect when you took your medication?",
    options: ["Always", "Often", "Sometimes", "Rarely", "Never"],
    openText: "What helps you remember your medication on days you drink or use?",
    openPlaceholder: "Your answers are private",
  },
  {
    theme: "Looking ahead",
    likertText: "How motivated do you feel to keep your viral load undetectable?",
    options: AGREE,
    openText: "What's one health goal you'd like to work on over the next month?",
    openPlaceholder: "Big or small",
  },
  {
    theme: "Celebrating progress",
    likertText: "How proud are you of the effort you've put into your health lately?",
    options: AGREE,
    openText: "What's a win from the past few weeks you'd like to remember?",
    openPlaceholder: "You deserve to celebrate it",
  },
];

let created = 0;
for (const [index, p] of PROMPTS.entries()) {
  const sequence = index + 1;
  const [existing] = await db
    .select({ id: checkinPrompts.id })
    .from(checkinPrompts)
    .where(eq(checkinPrompts.sequence, sequence))
    .limit(1);
  if (existing) continue;
  await db.insert(checkinPrompts).values({
    sequence,
    title: `SAMPLE — Week ${sequence}: ${p.theme}`,
    likertText: p.likertText,
    likertOptions: p.options.map((label, i) => ({ value: i + 1, label })),
    openText: p.openText,
    openPlaceholder: p.openPlaceholder,
    feedbackLow:
      "<p>Thanks for being honest — some weeks are harder than others, and that's okay. You don't have to figure it out alone: your peer navigator and your care team are here for you.</p><p>Take a look at today's tips for a few small ideas to try this week.</p>",
    feedbackMedium:
      "<p>Thanks for checking in. You're finding your way, and every step counts. Is there one small thing you could try this week to make it a little easier?</p>",
    feedbackHigh:
      "<p>That's great to hear! Whatever you're doing is working — keep it up. Consider sharing what helps you on the wall; it might help someone else too.</p>",
    moreAdherentFeedback: "You took your medication every day last week. That's a big deal — well done!",
    lessAdherentFeedback:
      "Some days last week didn't have a dose logged. Try pairing your pills with something you do every day, and check today's tips for more ideas.",
  });
  created += 1;
}
console.log(`prompts: ${created} created, ${PROMPTS.length - created} already there`);

// Sample daily check-ins (meds + mood) for the local participants' first two weeks.
for (const username of ["participant", "both"]) {
  const [user] = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!user) continue;
  const [profile] = await db
    .select({ interventionStartDate: profiles.interventionStartDate })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);
  if (!profile?.interventionStartDate) {
    console.log(`daily    ${username}: no study start date (run seed-tips first)`);
    continue;
  }
  const timezone = user.timezone || "America/New_York";
  const clock = { start: profile.interventionStartDate, timezone };
  const pattern = [
    { meds: true, mood: 1 },
    { meds: true, mood: 5 },
    { meds: false, mood: 8 },
    { meds: true, mood: 4 },
    { meds: true, mood: 2 },
    { meds: null, mood: null },
    { meds: true, mood: 5 },
    { meds: true, mood: 5 },
    { meds: true, mood: 1 },
    { meds: true, mood: 10 },
    { meds: true, mood: 9 },
    { meds: false, mood: 11 },
    { meds: true, mood: 3 },
    { meds: true, mood: 4 },
  ];
  let added = 0;
  for (const [i, entry] of pattern.entries()) {
    const at = studyDayStart(clock, i + 1);
    if (at > new Date()) break;
    const day = dayKey(at, timezone);
    const inserted = await db
      .insert(dailyCheckins)
      .values({ userId: user.id, day, meds: entry.meds, mood: entry.mood })
      .onConflictDoNothing({ target: [dailyCheckins.userId, dailyCheckins.day] })
      .returning({ id: dailyCheckins.id });
    added += inserted.length;
  }
  console.log(`daily    ${username}: ${added} sample day(s) added`);
}

await pgClient.end();
process.exit(0);
