/**
 * Sample Peer Navigation data for local testing (never run against production).
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-peer-nav.mts
 *
 * Assigns "coach" to "both" and "pnonly", fills in profiles, and creates
 * session progress, notes, messages, shared files, assignment history and
 * sign-in sessions. Re-running replaces the sample data for these accounts.
 * Run `pnpm seed` first so the accounts exist.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, pgClient, withTransaction } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import {
  messages as messagesTable,
  messageThreadMembers,
  messageThreads,
  pnCoachAssignments,
  pnFiles,
  pnNotes,
  pnSessionRevisions,
  pnSessions,
} from "@/server/db/schema/peer-nav";
import { profiles, type NewProfile } from "@/server/db/schema/profiles";
import { loginSessions } from "@/server/db/schema/system";
import { deleteFile, putFile } from "@/server/services/storage";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

async function userId(username: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!user) throw new Error(`Missing seeded user "${username}". Run pnpm seed first.`);
  return user.id;
}

const [coach, both, pnonly, coordinator] = await Promise.all(["coach", "both", "pnonly", "coordinator"].map(userId));
const participants = [both, pnonly];
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 60 * 60 * 1000);

// --- Clean previous sample data -------------------------------------------
const oldFiles = await db
  .select({ storageKey: pnFiles.storageKey })
  .from(pnFiles)
  .where(inArray(pnFiles.participantId, participants));
for (const file of oldFiles) await deleteFile(file.storageKey).catch(() => {});
await withTransaction(async (tx) => {
  // Notes reference sessions/revisions (set null) and revisions cascade with their session.
  await tx.delete(pnNotes).where(inArray(pnNotes.participantId, participants));
  await tx.delete(pnSessionRevisions).where(inArray(pnSessionRevisions.participantId, participants));
  await tx.delete(pnSessions).where(inArray(pnSessions.participantId, participants));
  await tx.delete(pnFiles).where(inArray(pnFiles.participantId, participants));
  // Messages and members cascade with their thread.
  await tx.delete(messageThreads).where(inArray(messageThreads.participantId, participants));
  await tx.delete(pnCoachAssignments).where(inArray(pnCoachAssignments.participantId, participants));
  await tx
    .delete(loginSessions)
    .where(and(eq(loginSessions.legacySite, "peernav"), eq(loginSessions.legacyTable, "seed_usage")));
});

async function upsertProfile(userId: string, fields: Partial<Omit<NewProfile, "id" | "userId">>) {
  await db
    .insert(profiles)
    .values({ userId, ...fields })
    .onConflictDoUpdate({ target: profiles.userId, set: fields });
}

// --- Profiles and assignment ----------------------------------------------
await upsertProfile(coach, {
  firstName: "Jordan",
  pronouns: "they/them",
  location: "Philadelphia, PA",
  aboutMe:
    "I've been a peer navigator for four years. I'm here to listen, share what's worked for me, and help you find the tools that fit your life. Outside of work I garden, cook for friends and walk my dog, Biscuit.",
  zoomLink: "https://zoom.us/j/5550100200",
});
await upsertProfile(both, {
  coachId: coach,
  pronouns: "she/her",
  location: "Camden, NJ",
  age: 24,
  onPrep: true,
  studyId: "LP-1042",
  participantCode: "PN-07",
});
await upsertProfile(pnonly, {
  coachId: coach,
  pronouns: "he/him",
  location: "Trenton, NJ",
  age: 29,
  onPrep: false,
  studyId: "LP-1088",
  participantCode: "PN-12",
});
await db.insert(pnCoachAssignments).values([
  { participantId: both, coachId: coach, previousCoachId: null, assignedBy: coordinator, createdAt: ago(30) },
  { participantId: pnonly, coachId: coach, previousCoachId: null, assignedBy: coordinator, createdAt: ago(12) },
]);

// --- Sessions ---------------------------------------------------------------
type SessionSeed = {
  serial: number;
  order: number;
  status: "not_started" | "in_progress" | "complete";
  startedDaysAgo?: number;
  completedDaysAgo?: number;
  revisions?: { daysAgo: number; answers: Record<string, boolean | string>; complete?: boolean }[];
};

async function seedSessions(participantId: string, sessions: SessionSeed[]) {
  for (const s of sessions) {
    const [doc] = await db
      .insert(pnSessions)
      .values({
        participantId,
        serial: s.serial,
        order: s.order,
        status: s.status,
        startedAt: s.startedDaysAgo !== undefined ? ago(s.startedDaysAgo) : null,
        completedAt: s.completedDaysAgo !== undefined ? ago(s.completedDaysAgo) : null,
        lastActivityAt: s.revisions?.length
          ? ago(Math.min(...s.revisions.map((r) => r.daysAgo)))
          : s.startedDaysAgo !== undefined
            ? ago(s.startedDaysAgo)
            : null,
        createdBy: coach,
      })
      .returning({ id: pnSessions.id });
    for (const r of s.revisions ?? []) {
      await db
        .insert(pnSessionRevisions)
        .values({
          sessionId: doc.id,
          participantId,
          serial: s.serial,
          coachId: coach,
          answers: r.answers,
          complete: Boolean(r.complete),
          createdAt: ago(r.daysAgo),
        });
    }
  }
}

const intake = {
  session_start_time: "15:00",
  intro_check1: true,
  intro_text1: "Busy week with work, but feeling hopeful about starting.",
  intro_check2: true,
  intro_check3: true,
  intro_text3: "Uses her phone for everything; data plan is limited, so Wi-Fi at home for video.",
  intro_check4: true,
  intro_check5: true,
  intro_text5: "Walked through Tips and favourites.",
  intro_check6: true,
  intro_check7: true,
  intro_text7: "Text first, calls after 5pm.",
  intro_check8: true,
  intro_check9: true,
  intro_check10: true,
  intro_text10: "Next Thursday 3pm.",
  general: "15:50",
  session: "1",
  phone: "1",
  video: "1",
};

await seedSessions(both, [
  {
    serial: 1,
    order: 1,
    status: "complete",
    startedDaysAgo: 21,
    completedDaysAgo: 21,
    revisions: [
      { daysAgo: 21.1, answers: { ...intake, intro_check9: false } },
      { daysAgo: 21, answers: intake, complete: true },
    ],
  },
  {
    serial: 2,
    order: 2,
    status: "complete",
    startedDaysAgo: 14,
    completedDaysAgo: 14,
    revisions: [
      {
        daysAgo: 14,
        complete: true,
        answers: {
          session_start_time: "15:05",
          intro_check1: true,
          intro_check2: true,
          intro_check3: true,
          intro_check4: true,
          intro_check5: true,
          engaging_check1: true,
          engaging_check2: true,
          evoking_check1: true,
          evoking_check3: true,
          evoking_text3: "Picked 'overwhelmed' and 'hopeful' from the feelings wheel.",
          planning_check1: true,
          planning_check2: true,
          planning_check3: true,
          summary_check1: true,
          summary_check2: true,
          summary_check4: true,
          general: "16:00",
          session: "2",
          session_time: "Participant had a doctor's appointment; moved from Tuesday.",
          phone: "1",
          video: "2",
        },
      },
    ],
  },
  {
    serial: 4,
    order: 3,
    status: "in_progress",
    startedDaysAgo: 2,
    revisions: [
      {
        daysAgo: 2,
        answers: {
          session_start_time: "15:00",
          intro_check1: true,
          intro_text1: "Good week, practiced breathing most days.",
          intro_check2: true,
          intro_text2: "Breathing exercise helped before a stressful call.",
          intro_text22: "Went to the park with her sister.",
        },
      },
    ],
  },
  { serial: 3, order: 4, status: "not_started" },
  { serial: 5, order: 5, status: "not_started" },
  { serial: 6, order: 6, status: "not_started" },
  // Migrated history from the earlier curriculum.
  {
    serial: 8,
    order: 8,
    status: "complete",
    startedDaysAgo: 900,
    completedDaysAgo: 899,
    revisions: [{ daysAgo: 899, answers: { engaging: "legacy" }, complete: true }],
  },
]);
await seedSessions(pnonly, [
  {
    serial: 1,
    order: 1,
    status: "in_progress",
    startedDaysAgo: 1,
    revisions: [
      {
        daysAgo: 1,
        answers: { session_start_time: "10:00", intro_check1: true, intro_text1: "Started a new job this week." },
      },
    ],
  },
]);

// --- Notes -------------------------------------------------------------------
await db.insert(pnNotes).values([
  {
    participantId: both,
    authorId: coach,
    sessionSerial: 1,
    text: "Great first session. Morgan is motivated and already comfortable with the app.",
    methodOfContact: "voice",
    createdAt: ago(21),
    updatedAt: ago(21),
  },
  {
    participantId: both,
    authorId: coach,
    sessionSerial: 2,
    text: "Rescheduled from Tuesday. Breathing exercise landed well; she wants to try it before bed.",
    methodOfContact: "voice",
    createdAt: ago(14),
    updatedAt: ago(14),
  },
  {
    participantId: both,
    authorId: coach,
    sessionSerial: null,
    text: "Left a voicemail to confirm Thursday's time.",
    methodOfContact: "voicemail",
    createdAt: ago(3),
    updatedAt: ago(3),
  },
  {
    participantId: both,
    authorId: coach,
    sessionSerial: null,
    text: "Texted the link to the self-monitoring form.",
    methodOfContact: "sms",
    createdAt: ago(1, 3),
    updatedAt: ago(1, 3),
  },
  {
    participantId: both,
    sessionSerial: null,
    text: "Follow-up email about the study schedule (migrated note, author not recorded).",
    methodOfContact: "email",
    createdAt: ago(40),
    updatedAt: ago(40),
  },
  {
    participantId: pnonly,
    authorId: coach,
    sessionSerial: 1,
    text: "Intro call went well; prefers mornings.",
    methodOfContact: "voice",
    createdAt: ago(1),
    updatedAt: ago(1),
  },
]);

// --- Messages -----------------------------------------------------------------
async function thread(
  participantId: string,
  subject: string,
  messages: { from: string; body: string; hoursAgo: number }[],
  readBy: { user: string; hoursAgo: number }[],
) {
  const last = messages[messages.length - 1];
  await withTransaction(async (tx) => {
    const [doc] = await tx
      .insert(messageThreads)
      .values({
        participantId,
        coachId: coach,
        subject,
        createdBy: messages[0].from,
        lastMessageAt: new Date(Date.now() - last.hoursAgo * 3600 * 1000),
        lastAuthorId: last.from,
      })
      .returning({ id: messageThreads.id });
    await tx.insert(messageThreadMembers).values(
      [participantId, coach].map((user) => {
        const read = readBy.find((r) => r.user === user);
        return {
          threadId: doc.id,
          userId: user,
          lastReadAt: read ? new Date(Date.now() - read.hoursAgo * 3600 * 1000) : null,
        };
      }),
    );
    await tx
      .insert(messagesTable)
      .values(
        messages.map((m) => ({
          threadId: doc.id,
          authorId: m.from,
          body: m.body,
          createdAt: new Date(Date.now() - m.hoursAgo * 3600 * 1000),
        })),
      );
  });
}

await thread(
  both,
  "Rescheduling Thursday",
  [
    { from: coach, body: "Hi Morgan! Just checking we're still on for Thursday at 3pm?", hoursAgo: 30 },
    { from: both, body: "Hey Jordan, something came up at work. Could we do 4:30 instead?", hoursAgo: 6 },
    { from: both, body: "Also, I filled in the feelings log and uploaded it to my files.", hoursAgo: 5.5 },
  ],
  [
    { user: coach, hoursAgo: 29 },
    { user: both, hoursAgo: 5.5 },
  ],
);
await thread(
  both,
  "Breathing exercise",
  [
    { from: both, body: "The 5 minute breathing thing actually helped me sleep last night.", hoursAgo: 24 * 9 },
    {
      from: coach,
      body: "That's wonderful to hear. Try it before bed again this week and tell me how it goes.",
      hoursAgo: 24 * 9 - 2,
    },
  ],
  [
    { user: coach, hoursAgo: 24 * 9 - 2 },
    { user: both, hoursAgo: 24 * 8 },
  ],
);
await thread(
  pnonly,
  "Welcome",
  [{ from: coach, body: "Welcome to Peer Navigation, Taylor! I'm Jordan. Reply here any time.", hoursAgo: 20 }],
  [{ user: coach, hoursAgo: 20 }],
);

// --- Files ---------------------------------------------------------------------
function tinyPdf(title: string) {
  const text = `BT /F1 18 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function file(participantId: string, uploadedBy: string, filename: string, daysAgo: number) {
  const data = tinyPdf(filename.replace(/\.pdf$/, ""));
  const key = await putFile(`peer-nav/${participantId}`, data, "application/pdf");
  await db
    .insert(pnFiles)
    .values({
      participantId,
      uploadedBy,
      filename,
      mime: "application/pdf",
      size: data.length,
      storageKey: key,
      createdAt: ago(daysAgo),
    });
}
await file(both, both, "Feelings log - week 2.pdf", 0.2);
await file(both, coach, "Focused breathing guide.pdf", 14);
await file(both, coach, "Self-monitoring form.pdf", 14);

// --- Sign-in sessions (usage report) ------------------------------------------------
const ua = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
};
const usage: { user: string; daysAgo: number; seconds: number | null; agent: string }[] = [
  { user: both, daysAgo: 21, seconds: 3605, agent: ua.iphone },
  { user: both, daysAgo: 14, seconds: 2710, agent: ua.iphone },
  { user: both, daysAgo: 9, seconds: 420, agent: ua.iphone },
  { user: both, daysAgo: 2, seconds: null, agent: ua.iphone },
  { user: both, daysAgo: 0.3, seconds: 64, agent: ua.windows },
  { user: pnonly, daysAgo: 1, seconds: 1800, agent: ua.android },
  { user: pnonly, daysAgo: 0.9, seconds: 1, agent: ua.android },
];
await db.insert(loginSessions).values(
  usage.map((u, i) => {
    const loginAt = ago(u.daysAgo);
    return {
      userId: u.user,
      loginAt,
      logoutAt: u.seconds === null ? null : new Date(loginAt.getTime() + u.seconds * 1000),
      userAgent: u.agent,
      program: "peernav" as const,
      legacySite: "peernav" as const,
      legacyTable: "seed_usage",
      legacyId: i + 1,
    };
  }),
);

console.log("Peer Navigation sample data ready: coach → both, pnonly.");
await pgClient.end();
process.exit(0);
