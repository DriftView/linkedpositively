/**
 * Sample wall content for local testing (never run against production):
 * posts, comments, reactions, hashtags, a mention, a content-warning post,
 * a YouTube post, a tip-comment mirror, reports for the moderation queue and
 * the notifications they cause. Re-running replaces the previous sample.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-community.mts
 *
 * All text is invented; no participant data.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, pgClient } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { comments, contentReports, posts as postsTable, reactions } from "@/server/db/schema/community";
import { tips } from "@/server/db/schema/tips";
import { prepareUserHtml } from "@/features/community/rich-text";
import {
  bumpHashtags,
  deletePostCascade,
  notifyComment,
  notifyMentions,
  notifyReaction,
  refreshPostTags,
  refreshReportCount,
  syncMentions,
} from "@/features/community/service";
import { REACTION_KINDS } from "@/features/community/types";
import { ensureStudyMessagesFor } from "@/features/notifications/jobs";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const SEED = "community-sample";

const usernames = ["participant", "both", "coordinator", "alex", "jamie", "dana", "kim", "robin", "shay", "legacyuser"];
const found = await db
  .select({ id: users.id, username: users.username, name: users.name })
  .from(users)
  .where(inArray(users.username, usernames));
const people = new Map(
  found.map((user) => [user.username ?? "", { id: user.id, name: user.name || (user.username ?? "") }]),
);
const who = (username: string) => people.get(username) ?? people.get("participant")!;
if (!people.has("participant")) {
  console.error("Run `pnpm seed` first (needs the participant account).");
  process.exit(1);
}

// Remove the previous sample.
const old = await db
  .select({ id: postsTable.id })
  .from(postsTable)
  .where(sql`${postsTable.extra}->>'seed' = ${SEED}`);
// The cascade keeps reports as moderation history ("removed"); the sample's own reports go entirely.
if (old.length) {
  await db.delete(contentReports).where(
    and(
      eq(contentReports.targetType, "post"),
      inArray(
        contentReports.targetId,
        old.map((post) => post.id),
      ),
    ),
  );
}
for (const post of old) await deletePostCascade(post.id);
const oldTipComments = await db
  .select({ id: comments.id })
  .from(comments)
  .where(sql`${comments.extra}->>'seed' = ${SEED}`);
if (oldTipComments.length) {
  const ids = oldTipComments.map((comment) => comment.id);
  await db.delete(comments).where(inArray(comments.id, ids));
  await db.delete(reactions).where(and(eq(reactions.targetType, "comment"), inArray(reactions.targetId, ids)));
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
const mention = (username: string) => {
  const person = who(username);
  return `<span data-type="mention" data-id="${person.id}" data-label="${person.name}">@${person.name}</span>`;
};

type Seed = {
  key: string;
  author: string;
  hours: number;
  html: string;
  headline?: string;
  videoId?: string;
  comments?: { author: string; html: string; hours: number }[];
  reactors?: string[];
  reporters?: string[];
};

const posts: Seed[] = [
  {
    key: "appointment",
    author: "dana",
    hours: 2,
    html: "<p>Finally made it to my appointment today, even though I almost talked myself out of it this morning. Small wins count! #selfcare</p>",
    reactors: ["alex", "kim", "participant", "shay", "jamie"],
    comments: [{ author: "kim", html: "<p>So proud of you! The hardest part is walking in the door.</p>", hours: 1.5 }],
  },
  {
    key: "rough-week",
    author: "alex",
    hours: 5,
    headline: "Rough week, missed doses",
    html: "<p>Work has been a lot and I skipped a couple of doses this week. Getting back on track tomorrow.</p><p>Anyone have tricks for remembering meds when your schedule is all over the place? #meds</p>",
    reactors: ["dana", "robin"],
    comments: [
      {
        author: "kim",
        html: "<p>Phone alarm with a label only you understand. Works for me every time.</p>",
        hours: 4.5,
      },
      { author: "shay", html: "<p>Pill box right next to my toothbrush. Can't miss it 🙌 #meds</p>", hours: 4 },
    ],
  },
  {
    key: "playlist",
    author: "participant",
    hours: 26,
    html: `<p>Shoutout to ${mention("jamie")} for the playlist recommendation. It got me through a very long bus ride 🎧 #music</p>`,
    reactors: ["jamie", "dana", "kim", "robin"],
    comments: [{ author: "jamie", html: "<p>Glad it helped!! More songs coming your way soon #music</p>", hours: 25 }],
  },
  {
    key: "meditation",
    author: "kim",
    hours: 30,
    html: "<p>This five-minute breathing video has become my go-to before bed. Sharing in case anyone else has trouble winding down.</p>",
    videoId: "inpok4MKVLM",
    reactors: ["participant", "alex"],
  },
  {
    key: "welcome",
    author: "coordinator",
    hours: 50,
    html: "<p>Welcome to everyone who joined this month! 👋 This wall is your space to share wins, questions and the everyday stuff. Be kind, keep each other's stories private, and have a look at the #community guidelines when you get a chance.</p>",
    reactors: ["participant", "dana", "alex", "jamie", "kim", "robin", "shay"],
  },
  {
    key: "disclosure",
    author: "robin",
    hours: 74,
    html: "<p>Question for everyone: how did you tell your closest friend? I'm thinking about it and could use some encouragement. #disclosure</p>",
    reactors: ["dana", "shay"],
    comments: [
      {
        author: "dana",
        html: "<p>I told my cousin first, over text, so I had time to breathe. She was amazing about it.</p>",
        hours: 72,
      },
      {
        author: "alex",
        html: `<p>Take your time, there's no deadline. ${mention("participant")} shared a great story about this a while back too.</p>`,
        hours: 70,
      },
      {
        author: "participant",
        html: "<p>It went better than I expected. Pick a quiet moment and have a plan for after. You've got this 💜</p>",
        hours: 60,
      },
    ],
  },
  {
    key: "dinner",
    author: "jamie",
    hours: 98,
    html: "<p>Cooked a real dinner tonight instead of takeout: rice, black beans and roasted veggies. My wallet and my body both said thank you. #selfcare #food</p>",
    reactors: ["participant", "kim"],
  },
  {
    key: "tickets",
    author: "legacyuser",
    hours: 110,
    html: "<p>Anyone want cheap concert tickets?? Message me, first come first served</p>",
    reporters: ["kim", "dana"],
  },
  {
    key: "undetectable",
    author: "shay",
    hours: 150,
    html: "<p>Three months on the same routine and my last labs came back great. Undetectable! 🎉 Thank you all for the pep talks. #undetectable</p>",
    reactors: ["participant", "dana", "alex", "jamie", "kim", "robin", "coordinator"],
    comments: [{ author: "robin", html: "<p>This made my whole week. Congrats!!</p>", hours: 148 }],
  },
];

let created = 0;
for (const seed of posts) {
  const author = who(seed.author);
  const body = prepareUserHtml(seed.html, { allowHeadline: true });
  const [post] = await db
    .insert(postsTable)
    .values({
      authorId: author.id,
      bodyHtml: body.html,
      bodyText: body.text,
      headline: seed.headline,
      videoId: seed.videoId,
      tags: body.tags,
      bodyTags: body.tags,
      mentionIds: body.mentionIds,
      createdAt: hoursAgo(seed.hours),
      extra: { seed: SEED },
    })
    .returning({ id: postsTable.id });
  const postId = post.id;
  created++;
  await bumpHashtags(body.tags, []);
  const mentioned = await syncMentions("post", postId, author.id, body.mentionIds);
  await notifyMentions({
    userIds: mentioned,
    actor: author,
    entity: "post",
    entityId: postId,
    text: body.text,
    href: `/posts/${postId}`,
  });

  for (const [index, username] of (seed.reactors ?? []).entries()) {
    const reactor = who(username);
    if (reactor.id === author.id) continue;
    const kind = REACTION_KINDS[(index * 3 + seed.key.length) % REACTION_KINDS.length];
    await db.insert(reactions).values({
      targetType: "post",
      targetId: postId,
      userId: reactor.id,
      authorId: author.id,
      kind,
      createdAt: hoursAgo(seed.hours - 0.2),
    });
    await notifyReaction({ target: { type: "post", id: postId }, authorId: author.id, actor: reactor, kind });
  }

  for (const item of seed.comments ?? []) {
    const commenter = who(item.author);
    const cbody = prepareUserHtml(item.html);
    const [comment] = await db
      .insert(comments)
      .values({
        targetType: "post",
        targetId: postId,
        authorId: commenter.id,
        bodyHtml: cbody.html,
        bodyText: cbody.text,
        tags: cbody.tags,
        mentionIds: cbody.mentionIds,
        createdAt: hoursAgo(item.hours),
      })
      .returning({ id: comments.id });
    await db
      .update(postsTable)
      .set({ commentCount: sql`${postsTable.commentCount} + 1` })
      .where(eq(postsTable.id, postId));
    await notifyComment({
      comment: { id: comment.id, text: cbody.text },
      target: { type: "post", id: postId },
      targetAuthorId: author.id,
      actor: commenter,
    });
    const tagged = await syncMentions("comment", comment.id, commenter.id, cbody.mentionIds);
    await notifyMentions({
      userIds: tagged,
      actor: commenter,
      entity: "comment",
      entityId: comment.id,
      text: cbody.text,
      href: `/posts/${postId}#comment-${comment.id}`,
    });
    // A reaction on the first comment, from the post's author.
    if (commenter.id !== author.id && item === seed.comments![0]) {
      await db.insert(reactions).values({
        targetType: "comment",
        targetId: comment.id,
        userId: author.id,
        authorId: commenter.id,
        kind: "love",
      });
      await notifyReaction({
        target: { type: "comment", id: comment.id },
        authorId: commenter.id,
        actor: author,
        kind: "love",
        parent: { type: "post", id: postId },
      });
    }
  }
  if (seed.comments?.some((item) => /#/.test(item.html))) await refreshPostTags(postId);

  for (const username of seed.reporters ?? []) {
    await db
      .insert(contentReports)
      .values({
        targetType: "post",
        targetId: postId,
        reporterId: who(username).id,
        authorId: author.id,
        createdAt: hoursAgo(seed.hours - 3),
      })
      .onConflictDoNothing();
  }
  if (seed.reporters?.length) await refreshReportCount("post", postId);
}

// A Thrive Tip discussion that shows up on the wall.
const [tip] = await db
  .select({ id: tips.id, title: tips.title })
  .from(tips)
  .where(eq(tips.published, true))
  .orderBy(sql`${tips.displayDay} asc nulls first`, asc(tips.id))
  .limit(1);
if (tip) {
  const commenter = who("dana");
  const body = prepareUserHtml(
    "<p>This one hit home. Writing down three good things each night has really helped me sleep.</p>",
  );
  const at = hoursAgo(12);
  const [comment] = await db
    .insert(comments)
    .values({
      targetType: "tip",
      targetId: tip.id,
      authorId: commenter.id,
      bodyHtml: body.html,
      bodyText: body.text,
      createdAt: at,
      extra: { seed: SEED },
    })
    .returning({ id: comments.id });
  await db.insert(postsTable).values({
    kind: "tip_comment",
    authorId: commenter.id,
    bodyHtml: body.html,
    bodyText: body.text,
    tipId: tip.id,
    tipCommentId: comment.id,
    tipTitle: tip.title,
    createdAt: at,
    extra: { seed: SEED },
  });
  await db.insert(reactions).values({
    targetType: "comment",
    targetId: comment.id,
    userId: who("participant").id,
    authorId: commenter.id,
    kind: "hundred",
  });
  created++;
}

// Welcome / time-on-site messages for the sample participant.
await ensureStudyMessagesFor(who("participant").id, "Sam");

console.log(`seeded ${created} posts`);
await pgClient.end();
process.exit(0);
