import { and, eq, isNotNull } from "drizzle-orm";
import { normalizeAnswers } from "@/features/peer-nav/answers";
import { getCurriculumSession } from "@/features/peer-nav/curriculum";
import {
  messages,
  messageThreadMembers,
  messageThreads,
  pnFiles,
  pnNotes,
  pnSessionRevisions,
  pnSessions,
  profiles,
  type PnContactMethod,
} from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";
import { nodes } from "./content";
import { q, type Ctx } from "./lib/context";
import { fv, int, loadFields, phpUnserialize, str, ts } from "./lib/drupal";
import { keepOrUpload, managedFiles } from "./lib/files";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Peer Navigation: session progress (ecoach_session_data), immutable session
 * revisions (ecoach_session_log, PHP-serialized form state → answers),
 * coach notes (node notes), shared files (file_usage user_attachments) and
 * private messages (privatemsg: pm_message + pm_index).
 * Not migrated: user_sessions nodes (unused content type), the webform "week1"
 * (no submissions), the two basic pages ("uc", "test").
 */

const CONTACT: Record<number, PnContactMethod> = { 1: "voice", 2: "voicemail", 3: "sms", 4: "email" };
const FORM_NOISE = new Set(["form_build_id", "form_token", "form_id", "op"]);

type Answers = Record<string, string | boolean>;

/** Drupal form values → answers: checkbox `{1: "1"|0}` → boolean, strings kept, empty radios dropped. */
function flattenAnswers(values: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      const inner = Object.values(value as Record<string, unknown>);
      if (inner.length === 1 && (typeof inner[0] === "string" || typeof inner[0] === "number")) out[key] = String(inner[0]) !== "0" && inner[0] !== 0;
      continue;
    }
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value);
      if (text.trim()) out[key] = text;
    } else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export async function migratePeerNav(ctx: Ctx) {
  const map = await userMap(ctx);
  const pnUser = (uid: unknown) => map.pn.get(Number(uid));

  // ---- sessions ----
  const data = await q<{ id: number; uid: number; aid: number; weight: number; sid: number; complete: number | null; date: number | null; goals: Buffer | null; created: number | null }>(
    ctx.pn,
    "select id, uid, aid, weight, sid, complete, date, goals, created from ecoach_session_data order by id",
  );
  const logs = await q<{ id: number; session_data_id: number; goals: Buffer | null; created: number }>(
    ctx.pn,
    "select id, session_data_id, goals, created from ecoach_session_log order by id",
  );
  const lastLog = new Map<number, number>();
  for (const log of logs) lastLog.set(Number(log.session_data_id), Math.max(lastLog.get(Number(log.session_data_id)) ?? 0, Number(log.created)));
  ctx.stats.source("peer_nav_sessions", data.length);
  const sessionRows = [];
  for (const row of data) {
    const participantId = pnUser(row.uid);
    if (!participantId) {
      ctx.stats.skip("peer_nav_sessions", "participant not migrated (deleted account)");
      continue;
    }
    const complete = Number(row.complete) === 1;
    const started = ts(row.created);
    const completed = complete ? ts(row.date) : null;
    const activity = Math.max(Number(row.created) || 0, Number(row.date) || 0, lastLog.get(row.id) ?? 0);
    const extra: Record<string, unknown> = {};
    const goals = row.goals ? phpUnserialize(row.goals) : null;
    if (goals) extra.goals = goals;
    if (!complete && row.date) extra.legacyDate = ts(row.date)?.toISOString();
    sessionRows.push({
      participantId,
      serial: Number(row.sid),
      order: Number(row.weight) || Number(row.sid),
      status: complete ? ("complete" as const) : started ? ("in_progress" as const) : ("not_started" as const),
      startedAt: started,
      completedAt: completed,
      lastActivityAt: ts(activity),
      createdBy: pnUser(row.aid) ?? null,
      updatedBy: pnUser(row.aid) ?? null,
      extra: Object.keys(extra).length ? extra : null,
      ...legacy("peernav", "ecoach_session_data", row.id),
      createdAt: started ?? ts(activity) ?? new Date(0),
      updatedAt: ts(activity) ?? new Date(0),
    });
  }
  const legacySerials = sessionRows.filter((s) => s.serial > 6).length;
  if (legacySerials) ctx.stats.note("peer_nav_sessions", `${legacySerials} rows from the old 2019–2020 curriculum (serial 7–10) kept as read-only history`);
  await upsertRows(ctx, "peer_nav_sessions", pnSessions, sessionRows, { target: [pnSessions.participantId, pnSessions.serial] });
  const sessions = new Map(
    (
      await ctx.db
        .select({ id: pnSessions.id, legacyId: pnSessions.legacyId, participantId: pnSessions.participantId, serial: pnSessions.serial })
        .from(pnSessions)
        .where(isNotNull(pnSessions.legacyId))
    ).map((s) => [s.legacyId!, s]),
  );

  // ---- revisions (immutable: insert only) ----
  ctx.stats.source("peer_nav_session_revisions", logs.length);
  const revisionRows = [];
  for (const log of logs) {
    const session = sessions.get(Number(log.session_data_id));
    if (!session) {
      ctx.stats.skip("peer_nav_session_revisions", "session not migrated (participant deleted or session row missing)");
      continue;
    }
    const goals = (phpUnserialize(log.goals) ?? {}) as Record<string, unknown>;
    const serial = session.serial;
    const raw = flattenAnswers((goals[`session${serial}`] ?? {}) as Record<string, unknown>);
    const curriculum = getCurriculumSession(serial);
    const answers = curriculum ? normalizeAnswers(curriculum, raw) : raw;
    const unmapped = Object.fromEntries(Object.entries(raw).filter(([key]) => !(key in answers)));
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(goals)) {
      if (FORM_NOISE.has(key) || key === `session${serial}` || /^\d+$/.test(key)) continue;
      extra[key] = value;
    }
    if (Object.keys(unmapped).length) extra.unmappedAnswers = unmapped;
    if (!log.goals || !Object.keys(goals).length) extra.unparsed = true;
    revisionRows.push({
      sessionId: session.id,
      participantId: session.participantId,
      serial,
      coachId: null,
      answers,
      complete: ["1", 1, true].includes(goals[`complete${serial}`] as never),
      createdAt: ts(log.created) ?? new Date(0),
      extra: Object.keys(extra).length ? extra : null,
      ...legacy("peernav", "ecoach_session_log", log.id),
    });
  }
  await upsertRows(ctx, "peer_nav_session_revisions", pnSessionRevisions, revisionRows, { insertOnly: true });
  const revisionIds = new Map(
    (await ctx.db.select({ id: pnSessionRevisions.id, legacyId: pnSessionRevisions.legacyId }).from(pnSessionRevisions).where(isNotNull(pnSessionRevisions.legacyId))).map(
      (r) => [r.legacyId!, r.id],
    ),
  );
  const sessionByKey = new Map([...sessions.values()].map((s) => [`${s.participantId}:${s.serial}`, s.id]));

  // ---- notes ----
  const noteNodes = await nodes(ctx, ctx.pn, ["notes"]);
  ctx.stats.source("peer_nav_notes", noteNodes.length);
  const noteFields = await loadFields(ctx.pn, "node", ["notes"], ["field_notes", "field_method_of_contact", "field_user", "field_session_ref"]);
  const noteRows = [];
  for (const node of noteNodes) {
    // field_user is the participant; node.uid was also set to the participant (the coach was never recorded).
    const participantUid = int(fv(noteFields, node.nid, "field_user", "target_id")) ?? node.uid;
    const participantId = pnUser(participantUid);
    if (!participantId) {
      ctx.stats.skip("peer_nav_notes", "participant not migrated (deleted account)");
      continue;
    }
    const serial = /^\d+$/.test(node.title.trim()) ? Number(node.title.trim()) : null;
    const method = int(fv(noteFields, node.nid, "field_method_of_contact"));
    const logId = int(fv(noteFields, node.nid, "field_session_ref", "target_id"));
    const extra: Record<string, unknown> = { title: node.title };
    if (method && !CONTACT[method]) extra.methodOfContact = method;
    if (logId) extra.sessionLogId = logId;
    if (participantUid !== node.uid) extra.nodeUid = node.uid;
    noteRows.push({
      participantId,
      authorId: null,
      sessionSerial: serial,
      sessionId: serial ? (sessionByKey.get(`${participantId}:${serial}`) ?? null) : null,
      revisionId: logId ? (revisionIds.get(logId) ?? null) : null,
      text: toPlainText(str(fv(noteFields, node.nid, "field_notes")) ?? "").length
        ? (str(fv(noteFields, node.nid, "field_notes")) ?? "").replace(/\r\n?/g, "\n").trim()
        : "",
      methodOfContact: method ? (CONTACT[method] ?? null) : null,
      deletedAt: node.status === 1 ? null : ts(node.changed),
      extra,
      ...legacy("peernav", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "peer_nav_notes", pnNotes, noteRows);

  // ---- files shared with the coach (private://user_attachments/{uid}) ----
  const usage = await q<{ fid: number; type: string; id: number }>(
    ctx.pn,
    "select fid, type, id from file_usage where module = 'ecoach_sessions' order by fid",
  );
  ctx.stats.source("peer_nav_files", usage.length);
  const files = await managedFiles(ctx, "peernav");
  const existingFiles = new Map(
    (await ctx.db.select({ legacyId: pnFiles.legacyId, key: pnFiles.storageKey }).from(pnFiles).where(isNotNull(pnFiles.legacyId))).map((f) => [f.legacyId!, f.key]),
  );
  const fileRows = [];
  for (const use of usage) {
    const file = files.get(Number(use.fid));
    // user_attachments: id = participant uid. session4 etc.: attachments of the old curriculum (id = session data).
    const participantId = use.type === "user_attachments" ? pnUser(use.id) : undefined;
    if (!file || !participantId) {
      ctx.stats.skip("peer_nav_files", file ? (use.type === "user_attachments" ? "participant not migrated" : `not a participant file (${use.type})`) : "file row missing");
      continue;
    }
    const uploaded = await keepOrUpload(ctx, existingFiles.get(Number(use.fid)), "peernav", Number(use.fid), `peer-nav/${participantId}`);
    if (!uploaded) {
      ctx.stats.skip("peer_nav_files", "file content missing from the backup (private files were not in the backup)");
      continue;
    }
    fileRows.push({
      participantId,
      uploadedBy: pnUser(file.uid) ?? null,
      filename: file.filename,
      mime: uploaded.type,
      size: Number(file.filesize) || 0,
      storageKey: uploaded.key,
      createdAt: ts(file.timestamp) ?? new Date(0),
      ...legacy("peernav", "file_managed", file.fid),
    });
  }
  await upsertRows(ctx, "peer_nav_files", pnFiles, fileRows);

  // ---- messages ----
  await migrateMessages(ctx, pnUser);
}

async function migrateMessages(ctx: Ctx, pnUser: (uid: unknown) => string | undefined) {
  const msgs = await q<{ mid: number; author: number; subject: string; body: string; format: string | null; timestamp: number; has_tokens: number }>(
    ctx.pn,
    "select mid, author, subject, body, format, timestamp, has_tokens from pm_message order by mid",
  );
  const index = await q<{ mid: number; thread_id: number; recipient: number; is_new: number; deleted: number }>(
    ctx.pn,
    "select mid, thread_id, recipient, is_new, deleted from pm_index",
  );
  ctx.stats.source("messages", msgs.length);
  const indexByMid = new Map<number, typeof index>();
  for (const row of index) (indexByMid.get(row.mid) ?? indexByMid.set(row.mid, []).get(row.mid)!).push(row);
  const coachOf = new Map(
    (await ctx.db.select({ userId: profiles.userId, coachId: profiles.coachId }).from(profiles)).map((p) => [p.userId, p.coachId]),
  );
  const { pn } = await userMap(ctx);
  const isCoach = new Set<string>();
  const roles = await q<{ uid: number }>(ctx.pn, "select ur.uid from users_roles ur join role r using (rid) where r.name in ('coach', 'coordinator', 'administrator')");
  for (const r of roles) if (pn.get(Number(r.uid))) isCoach.add(pn.get(Number(r.uid))!);

  type Item = { msg: (typeof msgs)[number]; idx: typeof index; authorId: string };
  const threads = new Map<number, { participantId: string; coachId: string; msgs: Item[] }>();
  for (const msg of msgs) {
    const authorId = pnUser(msg.author);
    if (!authorId) {
      ctx.stats.skip("messages", msg.author === 0 ? "author account deleted (author = 0)" : "author not migrated");
      continue;
    }
    // The old composer addressed every message to its sender (docs/legacy/05 §8.9). A participant's
    // message belongs to the thread with their assigned coach; a coach's message has no knowable participant.
    if (isCoach.has(authorId)) {
      ctx.stats.skip("messages", "sent by a coach to themselves (no participant to attach it to)");
      continue;
    }
    const coachId = coachOf.get(authorId);
    if (!coachId) {
      ctx.stats.skip("messages", "participant has no coach (thread needs one)");
      continue;
    }
    const idx = indexByMid.get(msg.mid) ?? [];
    const threadLegacy = idx[0]?.thread_id ?? msg.mid;
    const group = threads.get(threadLegacy) ?? threads.set(threadLegacy, { participantId: authorId, coachId, msgs: [] }).get(threadLegacy)!;
    group.msgs.push({ msg, idx, authorId });
  }
  if (ctx.opts.dryRun) return;
  for (const [threadLegacy, group] of threads) {
    const first = group.msgs[0];
    const last = group.msgs[group.msgs.length - 1];
    const firstAt = ts(first.msg.timestamp) ?? new Date(0);
    const lastAt = ts(last.msg.timestamp) ?? new Date(0);
    await upsertRows(ctx, "message_threads", messageThreads, [
      {
        participantId: group.participantId,
        coachId: group.coachId,
        subject: str(first.msg.subject) ?? "",
        createdBy: first.authorId,
        lastMessageAt: lastAt,
        lastAuthorId: last.authorId,
        ...legacy("peernav", "pm_index", threadLegacy),
        createdAt: firstAt,
        updatedAt: lastAt,
      },
    ]);
    const [thread] = await ctx.db
      .select({ id: messageThreads.id })
      .from(messageThreads)
      .where(and(eq(messageThreads.legacySite, "peernav"), eq(messageThreads.legacyTable, "pm_index"), eq(messageThreads.legacyId, threadLegacy)));
    const allIdx = group.msgs.flatMap((m) => m.idx);
    const members = [group.participantId, group.coachId].map((userId) => {
      const own = allIdx.filter((i) => pnUser(i.recipient) === userId);
      const read = userId === last.authorId || (own.length > 0 && own.every((i) => Number(i.is_new) === 0));
      const deleted = own.map((i) => Number(i.deleted)).filter((d) => d > 0);
      return { threadId: thread.id, userId, lastReadAt: read ? lastAt : null, deletedAt: deleted.length ? ts(Math.max(...deleted)) : null };
    });
    await upsertRows(ctx, "message_thread_members", messageThreadMembers, members, {
      target: [messageThreadMembers.threadId, messageThreadMembers.userId],
    });
    await upsertRows(
      ctx,
      "messages",
      messages,
      group.msgs.map(({ msg, idx, authorId }) => ({
        threadId: thread.id,
        authorId,
        body: toPlainText(msg.body ?? "") || (msg.body ?? "").trim(),
        deletedFor: idx.filter((i) => Number(i.deleted) > 0).map((i) => pnUser(i.recipient)).filter((v): v is string => !!v),
        createdAt: ts(msg.timestamp) ?? new Date(0),
        extra: { subject: msg.subject, format: msg.format, hasTokens: Number(msg.has_tokens) },
        ...legacy("peernav", "pm_message", msg.mid),
      })),
    );
  }
}
