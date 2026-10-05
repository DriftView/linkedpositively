import { inArray, isNotNull, sql } from "drizzle-orm";
import { cleanUserHtml, extractTagsFromHtml, htmlToText, parseYouTube, plainTextToHtml, splitHeadline } from "@/features/community/rich-text";
import { HEADLINE_MAX } from "@/features/community/types";
import {
  comments,
  communityUploads,
  contentReports,
  hashtags,
  posts,
  reactions,
  resources,
  tips,
  type Photo,
  type ReactionKind,
} from "@/server/db/schema";
import { nodes } from "./content";
import { q, type Ctx } from "./lib/context";
import { fv, fvAll, int, loadFields, str, ts } from "./lib/drupal";
import { keepOrUpload } from "./lib/files";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * The wall: posts (node type drupal_wall), comments (core comment on wall
 * posts, tips and resources), reactions (uy_wallflag_count + flagging),
 * abuse reports and whitelists (Flag abuse_*), hashtags (youthrive_tags).
 * Mentions: the contrib `mentions` table is empty on the old site.
 */

const REACTION_FLAGS: Record<string, ReactionKind | null> = {
  haha_node_reaction: "haha",
  haha_comment_reaction: "haha",
  love_node_reaction: "love",
  love_comment_reaction: "love",
  thumbs_up_node_reaction: "thumbs_up",
  thumbs_up_comment_reaction: "thumbs_up",
  fire_node_reactions: "hundred",
  fire_comment_reactions: "hundred",
  target_node_reactions: "target",
  target_comment_reaction: "target",
  // Defined but hidden on the old site; the new app has no equivalent kind.
  thought_node_reactions: null,
  thought_comment_reactions: null,
  super_node_reaction: null,
  super_comment_reactions: null,
};

/** Legacy body (raw entity-encoded text, or filtered HTML after an edit) → stored editor HTML. */
export function legacyBodyToHtml(raw: string) {
  const looksHtml = /<(p|br|a|b|strong|em|i|u|span|div|ul|ol|li|blockquote|dd)\b/i.test(raw);
  const source = looksHtml ? raw.replace(/\r\n?/g, "\n") : plainTextToHtml(raw.replace(/\r\n?/g, "\n"));
  // OpenGraph preview markup appended by opengraph_filter is not content.
  return cleanUserHtml(source.replace(/<div class="opengraph[\s\S]*$/i, ""));
}

export async function migrateCommunity(ctx: Ctx) {
  const map = await userMap(ctx);

  // ---- hashtags (vocabulary youthrive_tags) and their index ----
  const tagTerms = await q<{ tid: number; name: string }>(
    ctx.lp,
    "select t.tid, t.name from taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name = 'youthrive_tags'",
  );
  const tagName = new Map(tagTerms.map((t) => [Number(t.tid), t.name.trim().toLowerCase().replace(/^#/, "")]));
  const tagIndex = await q<{ tid: number; entity_id: number; comment_id: number | null }>(
    ctx.lp,
    "select tid, entity_id, comment_id from youthrive_tags_index where type = 'node'",
  );

  // ---- posts ----
  const wall = await nodes(ctx, ctx.lp, ["drupal_wall"]);
  ctx.stats.source("posts", wall.length);
  const fields = await loadFields(ctx.lp, "node", ["drupal_wall"], [
    "body",
    "field_drupal_wall_photos",
    "field_drupal_wall_videos",
    "field_post_bg",
    "field_youthrive_tags",
    "field_comment_id",
    "field_drupal_wall_image_style",
  ]);
  const commentRows = await q<{
    cid: number;
    nid: number;
    uid: number;
    pid: number;
    subject: string;
    created: number;
    changed: number;
    status: number;
    hostname: string;
    node_type: string;
  }>(
    ctx.lp,
    "select c.cid, c.nid, c.uid, c.pid, c.subject, c.created, c.changed, c.status, c.hostname, n.type node_type from comment c join node n using (nid) order by c.cid",
  );
  const commentFields = await loadFields(ctx.lp, "comment", null, ["comment_body", "field_comment_image", "field_comment_videos"]);

  const existingPosts = new Map(
    (await ctx.db.select({ legacyId: posts.legacyId, photo: posts.photo }).from(posts).where(isNotNull(posts.legacyId))).map((p) => [
      p.legacyId!,
      p.photo,
    ]),
  );
  const existingComments = new Map(
    (await ctx.db.select({ legacyId: comments.legacyId, photo: comments.photo }).from(comments).where(isNotNull(comments.legacyId))).map((c) => [
      c.legacyId!,
      c.photo,
    ]),
  );

  const uploads: { ownerId: string; photo: Photo; at: Date }[] = [];
  const toPhoto = async (existing: Photo | null | undefined, fid: number | null, width: unknown, height: unknown) => {
    const uploaded = await keepOrUpload(ctx, existing?.key, "lp", fid, "community/legacy");
    if (!uploaded) return existing ?? null;
    return {
      key: uploaded.key,
      type: uploaded.type,
      ...(int(width) ? { width: int(width)! } : {}),
      ...(int(height) ? { height: int(height)! } : {}),
    } satisfies Photo;
  };

  // Comment tags per post (from the comment bodies), for posts.tags = body tags ∪ comment tags.
  const commentTagsByNid = new Map<number, Set<string>>();
  const commentBodies = new Map<number, { html: string; text: string; tags: string[] }>();
  for (const c of commentRows) {
    const raw = str(fv(commentFields, c.cid, "comment_body")) ?? "";
    const html = legacyBodyToHtml(raw);
    const tags = extractTagsFromHtml(html);
    commentBodies.set(c.cid, { html, text: htmlToText(html), tags });
    if (c.node_type === "drupal_wall") {
      const set = commentTagsByNid.get(c.nid) ?? commentTagsByNid.set(c.nid, new Set()).get(c.nid)!;
      tags.forEach((t) => set.add(t));
    }
  }
  for (const row of tagIndex) {
    const name = tagName.get(Number(row.tid));
    if (!name) continue;
    if (row.comment_id) {
      const set = commentTagsByNid.get(row.entity_id) ?? commentTagsByNid.set(row.entity_id, new Set()).get(row.entity_id)!;
      set.add(name);
    }
  }

  const postRows = [];
  let headlines = 0;
  for (const node of wall) {
    const id = node.nid;
    const raw = str(fv(fields, id, "body")) ?? "";
    let html = legacyBodyToHtml(raw);
    let headline: string | null = null;
    ({ headline, html } = splitHeadline(html));
    // The old site also marked content-warning posts by a title starting with "!".
    if (!headline && /^!/.test(node.title.trim())) {
      const match = /^!([^!]+)!?/.exec(node.title.trim());
      if (match) headline = match[1].trim().slice(0, HEADLINE_MAX) || null;
    }
    if (headline) headlines++;
    const text = htmlToText(html);
    const bodyTags = new Set(extractTagsFromHtml(html));
    for (const row of tagIndex) if (row.entity_id === id && !row.comment_id && tagName.get(Number(row.tid))) bodyTags.add(tagName.get(Number(row.tid))!);
    for (const tid of fvAll(fields, id, "field_youthrive_tags", "tid")) {
      const name = tagName.get(Number(tid));
      if (name && !(commentTagsByNid.get(id)?.has(name) ?? false)) bodyTags.add(name);
    }
    const allTags = new Set([...bodyTags, ...(commentTagsByNid.get(id) ?? [])]);
    const videoRaw = str(fv(fields, id, "field_drupal_wall_videos"));
    const video = videoRaw ? parseYouTube(videoRaw) : null;
    const photoFid = int(fv(fields, id, "field_drupal_wall_photos", "fid"));
    const authorId = map.lp.get(node.uid) ?? null;
    const photo = await toPhoto(
      existingPosts.get(id),
      photoFid,
      fv(fields, id, "field_drupal_wall_photos", "width"),
      fv(fields, id, "field_drupal_wall_photos", "height"),
    );
    if (photo && authorId) uploads.push({ ownerId: authorId, photo, at: ts(node.created) ?? new Date(0) });
    const extra: Record<string, unknown> = { title: node.title };
    if (videoRaw && !video) extra.legacyVideo = videoRaw;
    if (photoFid && !photo) extra.photoFid = photoFid;
    const imageStyle = str(fv(fields, id, "field_drupal_wall_image_style"));
    if (imageStyle && imageStyle !== "_none") extra.imageStyle = imageStyle;
    const commentCount = commentRows.filter((c) => c.nid === id).length;
    if (!authorId) ctx.stats.skip("posts (author)", "author account deleted → Former member");
    postRows.push({
      kind: "post" as const,
      authorId,
      bodyHtml: text || !html ? html : "",
      bodyText: text,
      headline,
      photo,
      videoId: video?.id ?? null,
      videoStart: video?.start ?? null,
      postBg: str(fv(fields, id, "field_post_bg")),
      tags: [...allTags],
      bodyTags: [...bodyTags],
      mentionIds: [],
      commentCount,
      editedAt: node.changed - node.created > 60 ? ts(node.changed) : null,
      extra,
      ...legacy("lp", "node", id),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  if (headlines) ctx.stats.note("posts", `${headlines} content-warning posts ("!Headline!") → headline`);
  const tipNotifications = wall.filter((node) => node.title === "tip-notification").length;
  if (tipNotifications) ctx.stats.note("posts", `${tipNotifications} tip-notification posts migrated as plain posts (link to the tip comment not rebuilt)`);
  await upsertRows(ctx, "posts", posts, postRows);
  const postIds = new Map(
    (await ctx.db.select({ id: posts.id, legacyId: posts.legacyId }).from(posts).where(isNotNull(posts.legacyId))).map((p) => [p.legacyId!, p.id]),
  );
  const tipIds = new Map(
    (await ctx.db.select({ id: tips.id, legacyId: tips.legacyId }).from(tips).where(isNotNull(tips.legacyId))).map((t) => [t.legacyId!, t.id]),
  );
  const resourceIds = new Map(
    (await ctx.db.select({ id: resources.id, legacyId: resources.legacyId }).from(resources).where(isNotNull(resources.legacyId))).map((r) => [
      r.legacyId!,
      r.id,
    ]),
  );

  // ---- comments ----
  ctx.stats.source("comments", commentRows.length);
  const outComments = [];
  for (const c of commentRows) {
    const target =
      c.node_type === "drupal_wall"
        ? { type: "post" as const, id: postIds.get(c.nid) }
        : c.node_type === "thrive_tips"
          ? { type: "tip" as const, id: tipIds.get(c.nid) }
          : c.node_type === "resources"
            ? { type: "resource" as const, id: resourceIds.get(c.nid) }
            : null;
    if (!target?.id) {
      ctx.stats.skip("comments", `target not migrated (${c.node_type})`);
      continue;
    }
    const body = commentBodies.get(c.cid)!;
    const authorId = map.lp.get(c.uid) ?? null;
    if (!authorId) ctx.stats.skip("comments (author)", "author account deleted → Former member");
    const videoRaw = str(fv(commentFields, c.cid, "field_comment_videos"));
    const video = videoRaw ? parseYouTube(videoRaw) : null;
    const photoFid = int(fv(commentFields, c.cid, "field_comment_image", "fid"));
    const photo = await toPhoto(
      existingComments.get(c.cid),
      photoFid,
      fv(commentFields, c.cid, "field_comment_image", "width"),
      fv(commentFields, c.cid, "field_comment_image", "height"),
    );
    if (photo && authorId) uploads.push({ ownerId: authorId, photo, at: ts(c.created) ?? new Date(0) });
    const extra: Record<string, unknown> = { subject: c.subject };
    if (c.status !== 1) extra.unpublished = true;
    if (c.pid) extra.parentCid = c.pid;
    if (videoRaw && !video) extra.legacyVideo = videoRaw;
    outComments.push({
      targetType: target.type,
      targetId: target.id,
      authorId,
      bodyHtml: body.text || !body.html ? body.html : "",
      bodyText: body.text,
      photo,
      videoId: video?.id ?? null,
      videoStart: video?.start ?? null,
      tags: body.tags,
      mentionIds: [],
      editedAt: c.changed - c.created > 60 ? ts(c.changed) : null,
      extra,
      ...legacy("lp", "comment", c.cid),
      createdAt: ts(c.created) ?? new Date(0),
      updatedAt: ts(c.changed) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "comments", comments, outComments);
  const commentIds = new Map(
    (await ctx.db.select({ id: comments.id, legacyId: comments.legacyId, authorId: comments.authorId }).from(comments).where(isNotNull(comments.legacyId))).map(
      (c) => [c.legacyId!, c],
    ),
  );
  const postAuthor = new Map(postRows.map((p) => [p.legacyId, p.authorId]));

  // Uploaded photos are tracked like composer uploads (already attached).
  if (uploads.length && !ctx.opts.dryRun) {
    const keys = uploads.map((u) => u.photo.key);
    const known = new Set(
      (await ctx.db.select({ key: communityUploads.key }).from(communityUploads).where(inArray(communityUploads.key, keys))).map((u) => u.key),
    );
    const fresh = uploads.filter((u) => !known.has(u.photo.key));
    if (fresh.length) {
      await ctx.db.insert(communityUploads).values(
        fresh.map((u) => ({
          ownerId: u.ownerId,
          key: u.photo.key,
          type: u.photo.type ?? "image/jpeg",
          width: u.photo.width ?? null,
          height: u.photo.height ?? null,
          attachedAt: u.at,
          createdAt: u.at,
        })),
      );
    }
    ctx.stats.written("community_uploads", { inserted: fresh.length, updated: 0, unchanged: uploads.length - fresh.length });
  }

  // ---- reactions, reports, whitelists ----
  const flagNames = [...Object.keys(REACTION_FLAGS), "abuse_node", "abuse_comment", "abuse_whitelist_node", "abuse_whitelist_comment"];
  const marks = flagNames.map(() => "?").join(",");
  const flagRows = await q<{ src: string; id: number; name: string; entity_type: string; entity_id: number; uid: number; at: number }>(
    ctx.lp,
    `select "uy_wallflag_count" src, w.id, f.name, w.entity_type, w.entity_id, w.uid, w.created at
       from uy_wallflag_count w join flag f using (fid) where f.name in (${marks})
     union all
     select "flagging" src, g.flagging_id, f.name, g.entity_type, g.entity_id, g.uid, g.timestamp at
       from flagging g join flag f using (fid) where f.name in (${marks})
     order by at desc, id desc`,
    [...flagNames, ...flagNames],
  );
  const resolveTarget = (entityType: string, entityId: number) => {
    if (entityType === "node") {
      const id = postIds.get(entityId);
      return id ? { type: "post" as const, id, authorId: postAuthor.get(entityId) ?? null } : null;
    }
    const comment = commentIds.get(entityId);
    return comment ? { type: "comment" as const, id: comment.id, authorId: comment.authorId } : null;
  };

  const reactionByKey = new Map<string, Record<string, unknown>>();
  const reportByKey = new Map<string, Record<string, unknown>>();
  const whitelisted = new Map<string, Date>(); // "type:id" → when
  for (const flag of flagRows) {
    const isReaction = flag.name in REACTION_FLAGS;
    const isReport = flag.name === "abuse_node" || flag.name === "abuse_comment";
    const table = isReaction ? "reactions" : isReport ? "content_reports" : "whitelists";
    ctx.stats.source(`${table} (${flag.src})`, 1);
    const target = resolveTarget(flag.entity_type, flag.entity_id);
    if (!target) {
      ctx.stats.skip(`${table} (${flag.src})`, "post/comment deleted");
      continue;
    }
    if (!isReaction && !isReport) {
      const key = `${target.type}:${target.id}`;
      if (!whitelisted.has(key)) whitelisted.set(key, ts(flag.at) ?? new Date(0));
      continue;
    }
    const userId = map.lp.get(flag.uid);
    if (!userId) {
      ctx.stats.skip(`${table} (${flag.src})`, "user not migrated (deleted account)");
      continue;
    }
    const key = `${target.type}:${target.id}:${userId}`;
    if (isReaction) {
      const kind = REACTION_FLAGS[flag.name];
      if (!kind) {
        ctx.stats.skip(`${table} (${flag.src})`, `no matching reaction kind (${flag.name})`);
        continue;
      }
      // One reaction per user and item: the latest flag action wins (rows are sorted newest first).
      if (reactionByKey.has(key)) {
        ctx.stats.skip(`${table} (${flag.src})`, "older or duplicate reaction by the same user on the same item");
        continue;
      }
      reactionByKey.set(key, {
        targetType: target.type,
        targetId: target.id,
        userId,
        authorId: target.authorId,
        kind,
        createdAt: ts(flag.at) ?? new Date(0),
        ...legacy("lp", flag.src, flag.id),
      });
    } else {
      if (reportByKey.has(key)) {
        ctx.stats.skip(`${table} (${flag.src})`, "duplicate report by the same user on the same item");
        continue;
      }
      reportByKey.set(key, {
        targetType: target.type,
        targetId: target.id,
        reporterId: userId,
        authorId: target.authorId,
        createdAt: ts(flag.at) ?? new Date(0),
        status: "open",
        ...legacy("lp", flag.src, flag.id),
      });
    }
  }
  for (const report of reportByKey.values()) {
    const when = whitelisted.get(`${report.targetType}:${report.targetId}`);
    if (when) Object.assign(report, { status: "whitelisted", resolvedAt: when });
  }
  ctx.stats.source("reactions", reactionByKey.size);
  ctx.stats.source("content_reports", reportByKey.size);
  await upsertRows(ctx, "reactions", reactions, [...reactionByKey.values()], {
    target: [reactions.targetType, reactions.targetId, reactions.userId],
  });
  await upsertRows(ctx, "content_reports", contentReports, [...reportByKey.values()], {
    target: [contentReports.targetType, contentReports.targetId, contentReports.reporterId],
  });

  if (!ctx.opts.dryRun) {
    // Report counters and whitelist markers, as the moderation code keeps them.
    for (const [table, type] of [
      [posts, "post"],
      [comments, "comment"],
    ] as const) {
      await ctx.db.execute(sql`
        update ${table} t set
          report_count = coalesce((select count(*)::int from ${contentReports} r where r.target_type = ${type} and r.target_id = t.id and r.status = 'open'), 0),
          last_reported_at = (select max(r.created_at) from ${contentReports} r where r.target_type = ${type} and r.target_id = t.id)
        where t.legacy_id is not null and (
          t.report_count is distinct from coalesce((select count(*)::int from ${contentReports} r where r.target_type = ${type} and r.target_id = t.id and r.status = 'open'), 0)
          or t.last_reported_at is distinct from (select max(r.created_at) from ${contentReports} r where r.target_type = ${type} and r.target_id = t.id))`);
    }
    for (const [key, when] of whitelisted) {
      const [type, id] = key.split(":");
      const table = type === "post" ? posts : comments;
      await ctx.db.execute(sql`update ${table} set whitelisted_at = ${when} where id = ${id} and whitelisted_at is distinct from ${when}`);
    }
  }

  // ---- hashtags: every term, with useCount = posts tagged + tip/resource comments tagged ----
  ctx.stats.source("hashtags", tagTerms.length);
  const counts = new Map<string, { count: number; last: Date | null }>();
  const bump = (name: string, at: Date) => {
    const entry = counts.get(name) ?? { count: 0, last: null };
    entry.count++;
    if (!entry.last || at > entry.last) entry.last = at;
    counts.set(name, entry);
  };
  for (const post of postRows) for (const tag of post.tags) bump(tag, post.createdAt);
  for (const comment of outComments) if (comment.targetType !== "post") for (const tag of comment.tags) bump(tag, comment.createdAt);
  const tagRows = new Map<string, Record<string, unknown>>();
  for (const term of tagTerms) {
    const name = tagName.get(Number(term.tid))!;
    if (!/^\p{L}[\p{L}\p{N}_]{1,49}$/u.test(name)) {
      ctx.stats.skip("hashtags", "not a valid hashtag name");
      continue;
    }
    if (tagRows.has(name)) {
      ctx.stats.skip("hashtags", "duplicate name");
      continue;
    }
    tagRows.set(name, { name, useCount: counts.get(name)?.count ?? 0, lastUsedAt: counts.get(name)?.last ?? null, ...legacy("lp", "taxonomy_term_data", term.tid) });
  }
  for (const [name, entry] of counts) {
    if (!tagRows.has(name)) tagRows.set(name, { name, useCount: entry.count, lastUsedAt: entry.last });
  }
  await upsertRows(ctx, "hashtags", hashtags, [...tagRows.values()], { target: [hashtags.name] });
}
