/**
 * Seeds the admin / SMS / surveys area for local development:
 * - the weekly SMS program texts (verbatim legacy copy) and survey configs,
 * - study fields for the base seed accounts,
 * - a handful of fictional study accounts in every state,
 * - their SMS schedules with a realistic send log, clicks and a few replies,
 * - some login history, survey responses and audit entries.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-admin.mts
 *
 * Run `pnpm seed` first. Safe to re-run (existing rows are kept).
 */
import { randomUUID } from "node:crypto";
import { subDays, subHours, subMinutes } from "date-fns";
import { and, asc, count, eq, isNotNull, lte } from "drizzle-orm";
import { createAccount } from "@/server/auth/accounts";
import type { Role } from "@/server/auth/roles";
import { db, pgClient } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { profiles } from "@/server/db/schema/profiles";
import { smsClicks, smsInbound, smsSends, smsTemplates } from "@/server/db/schema/sms";
import { surveyResponses, surveys } from "@/server/db/schema/surveys";
import { appSettings, auditLog, loginSessions } from "@/server/db/schema/system";
import { DEFAULT_TEMPLATES, renderSmsBody } from "@/features/sms/program";
import { DEFAULT_SURVEYS } from "@/features/surveys/defaults";
import { ensureSchedule } from "@/features/sms/service";
import { shortUrl, appUrl } from "@/features/sms/links";
import { startOfLocalDay, welcomeSendTime } from "@/features/sms/schedule";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const now = new Date();

// 1. Program texts and surveys (site-authored configuration).
for (const template of DEFAULT_TEMPLATES) {
  await db
    .insert(smsTemplates)
    .values({ ...template, active: true })
    .onConflictDoNothing({ target: smsTemplates.key });
}
for (const survey of DEFAULT_SURVEYS) {
  await db.insert(surveys).values(survey).onConflictDoNothing({ target: surveys.key });
}
await db
  .insert(appSettings)
  .values({ key: "contactEmail", value: "study-team@example.test" })
  .onConflictDoNothing({ target: appSettings.key });
console.log("templates, surveys and settings ready");

// 2. Fictional study accounts.
type Seed = {
  username: string;
  name: string;
  roles: Role[];
  studyId?: string;
  phone?: string;
  startDaysAgo?: number;
  banned?: boolean;
  createdDaysAgo: number;
  timezone?: string;
  optOut?: boolean;
  coach?: string;
  pronouns?: string;
  age?: number;
};

const people: Seed[] = [
  {
    username: "participant",
    name: "Sam Participant",
    roles: ["participant"],
    studyId: "LP-1001",
    phone: "+15550100101",
    startDaysAgo: 66,
    createdDaysAgo: 80,
    pronouns: "they/them",
    age: 22,
  },
  {
    username: "both",
    name: "Morgan Both",
    roles: ["participant", "ecoach_user"],
    studyId: "LP-1002",
    phone: "+15550100102",
    startDaysAgo: 20,
    createdDaysAgo: 30,
    coach: "coach",
    age: 24,
  },
  {
    username: "control",
    name: "Quinn Control",
    roles: ["control"],
    studyId: "LP-1003",
    phone: "+15550100103",
    createdDaysAgo: 6,
    age: 19,
  },
  {
    username: "pnonly",
    name: "Taylor PN",
    roles: ["ecoach_user"],
    studyId: "PN-2001",
    createdDaysAgo: 40,
    coach: "coach",
  },
  {
    username: "river.c",
    name: "River Castillo",
    roles: ["control"],
    studyId: "LP-1010",
    phone: "+15550100110",
    createdDaysAgo: 3,
    timezone: "America/Chicago",
    pronouns: "she/her",
    age: 21,
  },
  {
    username: "jules.p",
    name: "Jules Park",
    roles: ["control"],
    studyId: "LP-1011",
    phone: "+15550100111",
    createdDaysAgo: 2,
    timezone: "America/Los_Angeles",
    age: 23,
  },
  {
    username: "ash.w",
    name: "Ash Williams",
    roles: ["control", "ecoach_user"],
    studyId: "LP-1012",
    phone: "+15550100112",
    createdDaysAgo: 1,
    coach: "coach",
    age: 20,
  },
  {
    username: "dakota.m",
    name: "Dakota Moore",
    roles: ["participant"],
    studyId: "LP-1013",
    phone: "+15550100113",
    startDaysAgo: 3,
    createdDaysAgo: 12,
    pronouns: "he/him",
    age: 25,
  },
  {
    username: "sky.n",
    name: "Sky Nguyen",
    roles: ["participant"],
    studyId: "LP-1014",
    phone: "+15550100114",
    startDaysAgo: 45,
    createdDaysAgo: 60,
    timezone: "America/Chicago",
    age: 22,
  },
  {
    username: "rowan.b",
    name: "Rowan Bell",
    roles: ["participant"],
    studyId: "LP-1015",
    phone: "+15550100115",
    startDaysAgo: 118,
    createdDaysAgo: 130,
    optOut: true,
    age: 24,
  },
  {
    username: "emery.l",
    name: "Emery Lopez",
    roles: ["participant"],
    studyId: "LP-1016",
    startDaysAgo: 30,
    createdDaysAgo: 41,
    timezone: "America/Denver",
    age: 19,
  },
  {
    username: "harper.j",
    name: "Harper James",
    roles: ["participant"],
    studyId: "LP-1017",
    phone: "+15550100117",
    startDaysAgo: 160,
    banned: true,
    createdDaysAgo: 175,
    age: 23,
  },
  {
    username: "kai.r",
    name: "Kai Robinson",
    roles: ["participant", "ecoach_user"],
    studyId: "LP-1018",
    phone: "+15550100118",
    startDaysAgo: 88,
    createdDaysAgo: 95,
    coach: "coach",
    age: 21,
  },
];

async function findUser(username: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  return user;
}
const coach = await findUser("coach");
const admin = await findUser("admin");
const coordinator = await findUser("coordinator");
if (!admin || !coordinator) throw new Error("Run `pnpm seed` first.");

const ids = new Map<string, string>();
for (const person of people) {
  let id = (await findUser(person.username))?.id;
  if (!id) {
    const user = await createAccount({
      username: person.username,
      email: `${person.username.replace(/\./g, "")}@example.test`,
      name: person.name,
      password: "password123",
      roles: person.roles,
      programs: person.roles.includes("ecoach_user") ? ["lp", "peernav"] : ["lp"],
      timezone: person.timezone ?? "America/New_York",
      banned: person.banned,
      createdAt: subDays(now, person.createdDaysAgo),
    });
    id = user.id;
    console.log(`created ${person.username}`);
  }
  ids.set(person.username, id);
  if (person.banned)
    await db.update(users).set({ banned: true, banReason: "Study period ended (150 days)" }).where(eq(users.id, id));

  const timezone = person.timezone ?? "America/New_York";
  const start =
    person.startDaysAgo !== undefined ? startOfLocalDay(subDays(now, person.startDaysAgo), timezone) : undefined;
  const fields = {
    studyId: person.studyId,
    ...(person.phone ? { phone: person.phone } : {}),
    ...(person.pronouns ? { pronouns: person.pronouns } : {}),
    ...(person.age ? { age: person.age } : {}),
    smsOptOut: Boolean(person.optOut),
    ...(person.coach && coach ? { coachId: coach.id } : {}),
    ...(start
      ? { interventionStartDate: start, roleChangedAt: welcomeSendTime(new Date(start.getTime() + 10 * 3600_000)) }
      : {}),
  };
  await db
    .insert(profiles)
    .values({ userId: id, ...fields })
    .onConflictDoUpdate({ target: profiles.userId, set: fields });
}

// 3. Schedules and a realistic send log.
const participants = people.filter((person) => person.roles.includes("participant"));
for (const person of participants) {
  const userId = ids.get(person.username)!;
  if (person.banned) {
    // Plan like an active participant, then let the block cancel the rest.
    await db.update(users).set({ banned: false }).where(eq(users.id, userId));
    await ensureSchedule(userId);
    await db.update(users).set({ banned: true }).where(eq(users.id, userId));
  } else {
    await ensureSchedule(userId);
  }
  const due = await db
    .select()
    .from(smsSends)
    .where(and(eq(smsSends.userId, userId), eq(smsSends.status, "scheduled"), lte(smsSends.scheduledFor, now)))
    .orderBy(asc(smsSends.scheduledFor));
  let index = 0;
  for (const send of due) {
    index++;
    const template = DEFAULT_TEMPLATES.find((candidate) => candidate.key === send.flag)!;
    let set: Partial<typeof smsSends.$inferInsert>;
    if (!person.phone) {
      set = { status: "skipped", reason: "no_phone" };
    } else if (person.optOut && send.week >= 12) {
      set = { status: "skipped", reason: "opted_out" };
    } else if (person.username === "sky.n" && send.week === 4) {
      set = { status: "failed", reason: "The 'To' number is not a valid mobile number.", attempts: 1 };
    } else {
      const link = template.linkPath ? shortUrl(send.id) : null;
      const clicked = (index * 7 + send.week) % 3 === 0;
      set = {
        status: "sent",
        sentAt: subMinutes(send.scheduledFor, -2),
        to: person.phone,
        from: "+15550009999",
        body: renderSmsBody(template.body, link),
        mediaUrl: appUrl(template.mediaPath),
        linkPath: template.linkPath || null,
        messageSid: `SM${randomUUID().replace(/-/g, "")}${index}`,
        attempts: 1,
        ...(clicked && link ? { clickedAt: subHours(send.scheduledFor, -3), clicks: 1 } : {}),
      };
      if (clicked && link) {
        await db
          .insert(smsClicks)
          .values({
            userId,
            flag: send.flag,
            cycle: send.cycle,
            sendId: send.id,
            week: send.week,
            firstClickAt: subHours(send.scheduledFor, -3),
            lastClickAt: subHours(send.scheduledFor, -3),
            count: 1,
          })
          .onConflictDoNothing({ target: [smsClicks.userId, smsClicks.flag, smsClicks.cycle] });
      }
    }
    await db.update(smsSends).set(set).where(eq(smsSends.id, send.id));
  }
  if (person.banned) {
    await db
      .update(smsSends)
      .set({ status: "cancelled", reason: "blocked" })
      .where(and(eq(smsSends.userId, userId), eq(smsSends.status, "scheduled")));
  }
}
console.log("send log ready");

// 4. Replies to the study number.
const replies = [
  { who: "rowan.b", body: "STOP", kind: "stop", daysAgo: 36 },
  { who: "sky.n", body: "Thanks! Is the check-in due on Sundays?", kind: "message", daysAgo: 2 },
  { who: "participant", body: "Got it 👍", kind: "message", daysAgo: 9 },
] as const;
for (const reply of replies) {
  const userId = ids.get(reply.who)!;
  const phone = people.find((person) => person.username === reply.who)?.phone ?? "+15550100000";
  const sid = `SMseed${reply.who.replace(/\W/g, "")}`;
  await db
    .insert(smsInbound)
    .values({
      messageSid: sid,
      from: phone,
      userId,
      body: reply.body,
      kind: reply.kind,
      receivedAt: subDays(now, reply.daysAgo),
    })
    .onConflictDoNothing({ target: smsInbound.messageSid, where: isNotNull(smsInbound.messageSid) });
}

// 5. Login history.
const [{ n: skySessions }] = await db
  .select({ n: count() })
  .from(loginSessions)
  .where(eq(loginSessions.userId, ids.get("sky.n")!));
if (skySessions === 0) {
  const agents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  ];
  const sessions: (typeof loginSessions.$inferInsert)[] = [];
  for (const [i, person] of participants.entries()) {
    if (person.banned || ["participant", "both"].includes(person.username)) continue;
    for (let n = 0; n < 4 + (i % 4); n++) {
      const loginAt = subHours(now, 6 + n * 31 + i * 5);
      sessions.push({
        userId: ids.get(person.username)!,
        loginAt,
        logoutAt: n % 2 ? subMinutes(loginAt, -14) : null,
        userAgent: agents[(i + n) % 3],
      });
    }
  }
  if (sessions.length) await db.insert(loginSessions).values(sessions);
}

// 6. Survey responses.
const responses = [
  {
    key: "baseline",
    who: "river.c",
    outcome: "created_user",
    source: "qualtrics",
    responseId: "R_seedRiver01",
    daysAgo: 3,
  },
  {
    key: "baseline",
    who: "jules.p",
    outcome: "created_user",
    source: "qualtrics",
    responseId: "R_seedJules01",
    daysAgo: 2,
  },
  {
    key: "midpoint",
    who: "kai.r",
    outcome: "updated_user",
    source: "qualtrics",
    responseId: "R_seedKai01",
    daysAgo: 12,
  },
  { key: "midpoint", who: "rowan.b", outcome: "completed", source: "staff", responseId: undefined, daysAgo: 40 },
] as const;
for (const response of responses) {
  const userId = ids.get(response.who)!;
  const [exists] = await db
    .select({ id: surveyResponses.id })
    .from(surveyResponses)
    .where(and(eq(surveyResponses.userId, userId), eq(surveyResponses.surveyKey, response.key)))
    .limit(1);
  if (exists) continue;
  await db
    .insert(surveyResponses)
    .values({
      surveyKey: response.key,
      userId,
      studyId: people.find((person) => person.username === response.who)?.studyId,
      responseId: response.responseId,
      source: response.source,
      outcome: response.outcome,
      completedAt: subDays(now, response.daysAgo),
    })
    .onConflictDoNothing();
}
await db
  .insert(surveyResponses)
  .values({
    surveyKey: "baseline",
    responseId: "R_seedSkip01",
    source: "qualtrics",
    outcome: "skipped",
    note: "duplicate_email",
    studyId: "LP-1003",
    completedAt: subDays(now, 4),
  })
  .onConflictDoNothing({ target: surveyResponses.responseId, where: isNotNull(surveyResponses.responseId) });

// 7. A little audit history.
const [{ n: auditCount }] = await db.select({ n: count() }).from(auditLog);
if (auditCount < 3) {
  await db.insert(auditLog).values([
    {
      actorId: coordinator.id,
      action: "user.create",
      targetIds: [ids.get("ash.w")!],
      summary: "Created account ash.w (control)",
      at: subDays(now, 1),
    },
    {
      actorId: coordinator.id,
      action: "randomize.participant",
      targetIds: [ids.get("dakota.m")!],
      summary: "Converted 1 control account to participant",
      at: subDays(now, 3),
    },
    {
      actorId: null,
      action: "user.autoblock",
      targetIds: [ids.get("harper.j")!],
      summary: "Automatically deactivated 1 participant at the end of the study period",
      at: subDays(now, 9),
    },
    {
      actorId: admin.id,
      action: "user.roles",
      targetIds: [ids.get("kai.r")!],
      summary: "Roles changed from participant to participant, ecoach_user",
      at: subDays(now, 20),
    },
    {
      actorId: null,
      action: "sms.optout",
      targetIds: [ids.get("rowan.b")!],
      summary: "Opted out of study texts by replying STOP",
      at: subDays(now, 36),
    },
  ]);
}

const [{ n: sendCount }] = await db.select({ n: count() }).from(smsSends);
const [{ n: userCount }] = await db.select({ n: count() }).from(users);
console.log(`done: ${sendCount} messages, ${userCount} accounts`);
await pgClient.end();
process.exit(0);
