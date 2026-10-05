/**
 * Verification report for the legacy migration (see verify.mts).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { LP_DB, PN_DB, q, type Ctx, type Stats } from "./context";
import { userMap } from "./user-map";

type Check = { name: string; ok: boolean; detail: string };

/** source → target mapping checked row by row. `user` = SQL expression of the owning uid (for orphan counts). */
const SOURCES: {
  site: "lp" | "peernav";
  source: string;
  from: string;
  user?: string;
  target: string;
  legacyTable: string;
  where?: string;
}[] = [
  { site: "lp", source: "users", from: "users where uid > 0", target: "user", legacyTable: "users" },
  { site: "peernav", source: "users", from: "users where uid > 0", target: "user", legacyTable: "users" },
  { site: "lp", source: "profile (profile2 main)", from: "profile", user: "uid", target: "profiles", legacyTable: "users" },
  { site: "lp", source: "node: page/public_page", from: "node where type in ('page','public_page')", target: "pages", legacyTable: "node" },
  { site: "lp", source: "taxonomy: glossary_terms", from: "taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name='glossary_terms'", target: "glossary_terms", legacyTable: "taxonomy_term_data" },
  { site: "lp", source: "node: journey_category", from: "node where type='journey_category'", target: "journey_categories", legacyTable: "node" },
  { site: "lp", source: "node: journey_methods", from: "node where type='journey_methods'", target: "journey_methods", legacyTable: "node" },
  { site: "lp", source: "node: journey_goals", from: "node where type='journey_goals'", target: "journey_goals", legacyTable: "node" },
  { site: "lp", source: "node: user_goals", from: "node where type='user_goals'", user: "uid", target: "journey_user_goals", legacyTable: "node" },
  { site: "lp", source: "taxonomy: thrive_tips_tags + categories", from: "taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name in ('thrive_tips_tags','thrive_tips_categories')", target: "tip_tags", legacyTable: "taxonomy_term_data" },
  { site: "lp", source: "node: thrive_tips", from: "node where type='thrive_tips'", target: "tips", legacyTable: "node" },
  { site: "lp", source: "flagging: favourites", from: "flagging g join flag f using (fid) where f.name='favourites'", user: "g.uid", target: "tip_favorites", legacyTable: "flagging" },
  { site: "lp", source: "user_tips_report", from: "user_tips_report", user: "uid", target: "tip_views", legacyTable: "user_tips_report" },
  { site: "lp", source: "taxonomy: resource_tags", from: "taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name='resource_tags'", target: "resource_tags", legacyTable: "taxonomy_term_data" },
  { site: "lp", source: "node: resources", from: "node where type='resources'", target: "resources", legacyTable: "node" },
  { site: "lp", source: "flagging: favorite_resource", from: "flagging g join flag f using (fid) where f.name='favorite_resource'", user: "g.uid", target: "resource_favorites", legacyTable: "flagging" },
  { site: "lp", source: "node: drupal_wall", from: "node where type='drupal_wall'", user: "uid", target: "posts", legacyTable: "node" },
  { site: "lp", source: "comment", from: "comment", user: "uid", target: "comments", legacyTable: "comment" },
  { site: "lp", source: "taxonomy: youthrive_tags", from: "taxonomy_term_data t join taxonomy_vocabulary v using (vid) where v.machine_name='youthrive_tags'", target: "hashtags", legacyTable: "taxonomy_term_data" },
  { site: "lp", source: "node: weekly_checkin_prompt", from: "node where type='weekly_checkin_prompt'", target: "checkin_prompts", legacyTable: "node" },
  { site: "lp", source: "weekly_checkin_feedback (rows → weeks)", from: "weekly_checkin_feedback", user: "user_id", target: "weekly_checkins", legacyTable: "weekly_checkin_feedback" },
  { site: "lp", source: "reminder_checkin", from: "reminder_checkin", user: "uid", target: "daily_checkins", legacyTable: "reminder_checkin" },
  { site: "lp", source: "ts_tracking", from: "ts_tracking", user: "uid", target: "trackers", legacyTable: "ts_tracking" },
  { site: "lp", source: "ts_tracking_data", from: "ts_tracking_data", user: "uid", target: "tracker_entries", legacyTable: "ts_tracking_data" },
  { site: "lp", source: "reminder_checkin_time", from: "reminder_checkin_time", user: "uid", target: "checkin_reminders", legacyTable: "reminder_checkin_time" },
  { site: "lp", source: "achievement_stats", from: "achievement_stats", user: "uid", target: "point_entries", legacyTable: "achievement_stats" },
  { site: "lp", source: "uy_sms_reminder_stats", from: "uy_sms_reminder_stats", user: "uid", target: "sms_sends", legacyTable: "uy_sms_reminder_stats" },
  { site: "lp", source: "sms_engagement_messages", from: "sms_engagement_messages", user: "uid", target: "sms_clicks", legacyTable: "sms_engagement_messages" },
  { site: "lp", source: "multiple_qsurveys", from: "multiple_qsurveys", target: "surveys", legacyTable: "multiple_qsurveys" },
  { site: "lp", source: "users_logs (Qualtrics responses)", from: "users_logs", target: "survey_responses", legacyTable: "users_logs" },
  { site: "lp", source: "node: tech_support", from: "node where type='tech_support'", user: "uid", target: "support_tickets", legacyTable: "node" },
  { site: "lp", source: "youthrive_reports", from: "youthrive_reports", user: "uid", target: "login_sessions", legacyTable: "youthrive_reports" },
  { site: "lp", source: "ts_user_stats", from: "ts_user_stats", user: "uid", target: "usage_events", legacyTable: "ts_user_stats" },
  { site: "lp", source: "profile_features_update", from: "profile_features_update", user: "uid", target: "usage_events", legacyTable: "profile_features_update" },
  { site: "peernav", source: "ecoach_session_data", from: "ecoach_session_data", user: "uid", target: "peer_nav_sessions", legacyTable: "ecoach_session_data" },
  { site: "peernav", source: "ecoach_session_log", from: "ecoach_session_log l left join ecoach_session_data d on d.id = l.session_data_id", user: "d.uid", target: "peer_nav_session_revisions", legacyTable: "ecoach_session_log" },
  { site: "peernav", source: "node: notes", from: "node n left join field_data_field_user f on f.entity_id = n.nid and f.entity_type = 'node' where n.type='notes'", user: "coalesce(f.field_user_target_id, n.uid)", target: "peer_nav_notes", legacyTable: "node" },
  { site: "peernav", source: "file_usage: user_attachments", from: "file_usage where module='ecoach_sessions' and type='user_attachments'", user: "id", target: "peer_nav_files", legacyTable: "file_managed" },
  { site: "peernav", source: "pm_message", from: "pm_message", user: "author", target: "messages", legacyTable: "pm_message" },
];

/** Tables that are Drupal plumbing (never migrated, not listed). */
const INTERNAL =
  /^(cache.*|sessions|watchdog|accesslog|search_.*|menu_.*|registry.*|system|variable|semaphore|queue|batch|flood|history|sequences|actions|block.*|date_format.*|filter.*|field_config.*|field_revision_.*|features_signature|ctools_.*|views_.*|rdf_mapping|role_permission|shortcut_set.*|image_effects|image_styles|node_type|node_access|node_revision|node_comment_statistics|taxonomy_vocabulary|taxonomy_term_hierarchy|taxonomy_index|url_alias|file_usage|file_managed|users_roles|role|authmap|elysia_cron|ckeditor_.*|quicktabs|vef_video_styles|feeds_.*|date_formats|webform_roles|profile_type|flag_types|flag|field_conditional_.*|week_days|pm_tags.*|pm_index|cas_user)$/;

/** Every other legacy table with data, and what happened to it. */
const HANDLED: Record<string, string> = {
  users: "migrated (users, accounts, profiles)",
  profile: "migrated into profiles",
  node: "migrated per type (see the table above)",
  comment: "migrated (comments)",
  taxonomy_term_data: "migrated per vocabulary (tip_tags, resource_tags, glossary_terms, hashtags); custom_tracking terms → trackers.kind",
  flagging: "migrated (tip/resource favourites, reactions, abuse reports, whitelists)",
  uy_wallflag_count: "reactions + abuse reports for live content (one reaction per user and item); tailored-tip (fid 9) and favourites history are not current state",
  youthrive_tags_index: "folded into posts.tags / bodyTags and hashtags.useCount",
  avatar_selection: "mapped to the app's avatar/badge catalog (profiles.avatarId / badges); images ship with the app",
  avatar_selection_roles: "replaced by level-gated packs in features/gamification/catalog.ts",
  ts_locations: "folded into resources.lat/lng",
  twilio_user: "folded into profiles.phone",
  ts_tracking_time: "folded into trackers.reminder (hour/minute)",
  ts_tracking_bkp: "NOT migrated: old backup copy of ts_tracking (docs/legacy/01 §5 says ignore)",
  achievement_storage: "NOT migrated: per-user 'already awarded' counters; the ledger (achievement_stats) is migrated",
  achievement_totals: "NOT migrated: dead contrib totals, not maintained (docs/legacy/01 §4.6)",
  achievement_unlocks: "NOT migrated: dead contrib unlocks; levels are computed from points",
  avatar_selection_usage: "NOT migrated: superseded by field_avatar (profiles.avatarId)",
  cas_server_tickets: "NOT migrated: transient CAS tickets",
  record_shorten: "NOT migrated: TinyURL shortening log (operational)",
  qsurvey: "migrated as surveys.fieldMap (via multiple_qsurveys)",
  qsurvey_admin: "NOT migrated: Qualtrics API credentials (secret; new token goes in env)",
  qsurvey_watchdog: "NOT migrated: sync error log",
  twm_survey_response_log: "NOT migrated: sync timing log; its ResponseIDs are all in users_logs (migrated)",
  uy_user_notifications: "NOT migrated: dismissal log of notifications the old site computed on the fly; the new app stores notifications as events",
  user_goals_reported: "folded into journey_user_goals.updateCount (all rows name deleted uids)",
  field_collection_item: "NOT migrated: SMS script on node reminder_messages, never read by code (texts are seeded sms_templates)",
  field_collection_item_revision: "NOT migrated: see field_collection_item",
  profile_features_update: "migrated as usage_events (one event per counter row, meta.count)",
  ts_user_stats: "migrated as usage_events (one event per counter row, meta.count)",
  multiple_qsurveys: "migrated (surveys)",
  users_logs: "migrated (survey_responses)",
  webform: "NOT migrated: PN test webform 'week1' with no submissions",
  webform_component: "NOT migrated: see webform",
  node_counter: "NOT migrated: page view counter",
  ecoach_session_data: "migrated (peer_nav_sessions)",
  ecoach_session_log: "migrated (peer_nav_session_revisions)",
  pm_message: "migrated (messages, threads) where author and coach are known",
  flag_counts: "NOT migrated: aggregate counts (recomputed from rows)",
  feeds_source: "NOT migrated: importer state",
  achievement_stats: "migrated (point_entries)",
  reminder_checkin: "migrated (daily_checkins)",
  reminder_checkin_time: "migrated (checkin_reminders)",
  sms_engagement_messages: "migrated (sms_clicks)",
  uy_sms_reminder_stats: "migrated (sms_sends)",
  ts_tracking: "migrated (trackers)",
  ts_tracking_data: "migrated (tracker_entries)",
  user_tips_report: "migrated (tip_views)",
  weekly_checkin_feedback: "migrated (weekly_checkins)",
  youthrive_reports: "migrated (login_sessions)",
  ecoach_usage_session: "migrated (login_sessions, program peernav)",
};

async function count(pool: Ctx["lp"], fromSql: string) {
  const rows = await q<{ n: number }>(pool, `select count(*) n from ${fromSql}`);
  return Number(rows[0]?.n ?? 0);
}

export async function runVerification(ctx: Pick<Ctx, "db" | "lp" | "pn">, stats?: Stats) {
  const checks: Check[] = [];
  const lines: string[] = [];
  const out = (line = "") => {
    lines.push(line);
  };

  // ---- encoding ----
  const [enc] = (await ctx.db.execute(sql`select pg_encoding_to_char(encoding) as e from pg_database where datname = current_database()`)) as unknown as {
    e: string;
  }[];
  checks.push({ name: "target database encoding is UTF8", ok: enc?.e === "UTF8", detail: enc?.e ?? "unknown" });

  const map = await userMap(ctx as Ctx, true);
  const lpUids = [...map.lp.keys()];
  const pnUids = [...map.pn.keys()];

  out("# Legacy data migration report");
  out();
  out(`Generated ${new Date().toISOString()} · sources: MySQL \`${LP_DB}\` (Link Positively) + \`${PN_DB}\` (Peer Navigation)`);
  out();
  out("## Source rows vs migrated rows");
  out();
  out("Orphans = source rows whose user is not migrated (the Drupal account was deleted, or uid 0). Migrated = target rows carrying this source's legacy ids.");
  out();
  out("| site | source | source rows | orphans | migrated | target table |");
  out("|---|---|---:|---:|---:|---|");
  for (const s of SOURCES) {
    const pool = s.site === "lp" ? ctx.lp : ctx.pn;
    const source = await count(pool, s.from);
    let orphans = 0;
    if (s.user) {
      const uids = s.site === "lp" ? lpUids : pnUids;
      const where = s.from.includes(" where ") ? " and " : " where ";
      orphans = await count(pool, `${s.from}${where}${uids.length ? `(${s.user}) not in (${uids.join(",")})` : "1=1"}`);
    }
    let migrated = 0;
    if (s.target !== "user") {
      const [row] = (await ctx.db.execute(
        sql`select count(*)::int as n from ${sql.identifier(s.target)} where legacy_site = ${s.site} and legacy_table = ${s.legacyTable}`,
      )) as unknown as { n: number }[];
      migrated = row?.n ?? 0;
    }
    if (s.target === "user") {
      const [u] = (await ctx.db.execute(
        s.site === "lp"
          ? sql`select count(*)::int as n from "user" where legacy ? 'lpUid'`
          : sql`select count(*)::int as n from "user" where legacy ? 'pnUid'`,
      )) as unknown as { n: number }[];
      migrated = u?.n ?? 0;
    }
    out(`| ${s.site} | ${s.source} | ${source} | ${orphans} | ${migrated} | ${s.target} |`);
  }

  // ---- users ----
  const [lpCount, pnCount] = [await count(ctx.lp, "users where uid > 0"), await count(ctx.pn, "users where uid > 0")];
  const [merged] = (await ctx.db.execute(sql`select count(*)::int as n from "user" where legacy ? 'lpUid' and legacy ? 'pnUid'`)) as unknown as { n: number }[];
  const [pnOnly] = (await ctx.db.execute(sql`select count(*)::int as n from "user" where legacy->>'site' = 'peernav'`)) as unknown as { n: number }[];
  const [userTotal] = (await ctx.db.execute(sql`select count(*)::int as n from "user" where legacy is not null`)) as unknown as { n: number }[];
  checks.push({
    name: "every legacy account maps to exactly one user (lp + peernav − merged = users)",
    ok: lpCount + pnCount - merged.n === userTotal.n && map.lp.size === lpCount && map.pn.size === pnCount,
    detail: `lp ${lpCount} + peernav ${pnCount} − merged ${merged.n} = ${lpCount + pnCount - merged.n}; users ${userTotal.n} (peernav-only ${pnOnly.n})`,
  });
  const [byMatch] = (await ctx.db.execute(
    sql`select coalesce(string_agg(m || ' ' || n, ', '), '') as s from (select legacy->>'match' m, count(*) n from "user" where legacy ? 'match' group by 1 order by 1) x`,
  )) as unknown as { s: string }[];
  const [dupEmail] = (await ctx.db.execute(sql`select count(*)::int as n from (select lower(email) from "user" group by 1 having count(*) > 1) x`)) as unknown as { n: number }[];
  checks.push({ name: "no duplicate emails", ok: dupEmail.n === 0, detail: String(dupEmail.n) });
  const [noCred] = (await ctx.db.execute(
    sql`select count(*)::int as n from "user" u where u.legacy is not null and not exists (select 1 from account a where a.user_id = u.id and a.provider_id = 'credential' and a.password is not null)`,
  )) as unknown as { n: number }[];
  checks.push({ name: "every migrated user has a password credential", ok: noCred.n === 0, detail: `${noCred.n} without` });
  const [badHash] = (await ctx.db.execute(
    sql`select count(*)::int as n from account a join "user" u on u.id = a.user_id where u.legacy is not null and a.provider_id = 'credential' and not (a.password ~ '^(U?\$S\$|\$H\$|\$P\$)' and length(a.password) in (55, 56) or a.password !~ '^(U?\$S\$|\$H\$|\$P\$)')`,
  )) as unknown as { n: number }[];
  checks.push({ name: "Drupal hashes have the format verifyDrupalPassword expects ($S$ + 52 chars)", ok: badHash.n === 0, detail: `${badHash.n} malformed` });
  const blocked = (await count(ctx.lp, "users where uid > 0 and status = 0")) ;
  const [banned] = (await ctx.db.execute(sql`select count(*)::int as n from "user" where legacy->>'site' = 'lp' and banned`)) as unknown as { n: number }[];
  checks.push({ name: "blocked LP accounts are banned", ok: banned.n === blocked, detail: `${blocked} blocked → ${banned.n} banned` });

  // ---- duplicates by legacy key ----
  const legacyTables = [...new Set(SOURCES.map((s) => s.target))].filter((t) => t !== "user");
  let dupes = 0;
  for (const table of legacyTables) {
    const [d] = (await ctx.db.execute(
      sql`select count(*)::int as n from (select 1 from ${sql.identifier(table)} where legacy_id is not null group by legacy_site, legacy_table, legacy_id having count(*) > 1) x`,
    )) as unknown as { n: number }[];
    dupes += d.n;
  }
  checks.push({ name: "no duplicate legacy ids in any table", ok: dupes === 0, detail: String(dupes) });

  // ---- sums ----
  const points = await q<{ uid: number; total: number }>(ctx.lp, "select uid, sum(points) total from achievement_stats group by uid");
  const pgPoints = new Map(
    ((await ctx.db.execute(
      sql`select user_id as "userId", sum(points)::int as total from point_entries where legacy_site = 'lp' and legacy_table = 'achievement_stats' group by user_id`,
    )) as unknown as { userId: string; total: number }[]).map((r) => [r.userId, Number(r.total)]),
  );
  let pointUsers = 0;
  let pointMismatch = 0;
  let pointSum = 0;
  for (const row of points) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) continue;
    pointUsers++;
    pointSum += Number(row.total);
    if (pgPoints.get(userId) !== Number(row.total)) pointMismatch++;
  }
  checks.push({
    name: "total points per user equal before/after",
    ok: pointMismatch === 0,
    detail: `${pointUsers} users, ${pointSum} points, ${pointMismatch} mismatches`,
  });
  const comments = await q<{ nid: number; n: number }>(ctx.lp, "select c.nid, count(*) n from comment c join node n using (nid) where n.type = 'drupal_wall' group by c.nid");
  const pgCounts = new Map(
    ((await ctx.db.execute(sql`select legacy_id as "nid", comment_count as n from posts where legacy_site = 'lp' and legacy_table = 'node'`)) as unknown as {
      nid: number;
      n: number;
    }[]).map((r) => [Number(r.nid), Number(r.n)]),
  );
  const [actualComments] = (await ctx.db.execute(
    sql`select count(*)::int as n from posts p where p.legacy_id is not null and p.comment_count <> (select count(*) from comments c where c.target_type = 'post' and c.target_id = p.id)`,
  )) as unknown as { n: number }[];
  const commentMismatch = comments.filter((c) => (pgCounts.get(Number(c.nid)) ?? -1) !== Number(c.n)).length;
  checks.push({
    name: "comments per wall post equal before/after (and posts.commentCount matches the comments table)",
    ok: commentMismatch === 0 && actualComments.n === 0,
    detail: `${comments.length} posts with comments, ${commentMismatch} source mismatches, ${actualComments.n} counter mismatches`,
  });
  const daily = await q<{ uid: number; n: number }>(
    ctx.lp,
    "select uid, count(distinct from_unixtime(created, '%Y-%m-%d')) n from reminder_checkin group by uid",
  );
  const pgDaily = new Map(
    ((await ctx.db.execute(
      sql`select user_id as "userId", count(*)::int as n from daily_checkins where legacy_site = 'lp' group by user_id`,
    )) as unknown as { userId: string; n: number }[]).map((r) => [r.userId, Number(r.n)]),
  );
  let dailyMismatch = 0;
  let dailyUsers = 0;
  for (const row of daily) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) continue;
    dailyUsers++;
    // Source days are counted in the MySQL session timezone; allow ±1 for days split across a zone boundary.
    if (Math.abs((pgDaily.get(userId) ?? 0) - Number(row.n)) > 1) dailyMismatch++;
  }
  checks.push({ name: "daily check-in days per user (±1 day for timezone)", ok: dailyMismatch === 0, detail: `${dailyUsers} users, ${dailyMismatch} mismatches` });
  const [orphanFk] = (await ctx.db.execute(
    sql`select (select count(*) from comments c where c.target_type = 'post' and not exists (select 1 from posts p where p.id = c.target_id))
      + (select count(*) from reactions r where r.target_type = 'post' and not exists (select 1 from posts p where p.id = r.target_id))
      + (select count(*) from reactions r where r.target_type = 'comment' and not exists (select 1 from comments c where c.id = r.target_id))
      + (select count(*) from content_reports r where r.target_type = 'post' and not exists (select 1 from posts p where p.id = r.target_id))
      as n`,
  )) as unknown as { n: number }[];
  checks.push({ name: "no polymorphic orphans (comments/reactions/reports point to existing items)", ok: Number(orphanFk.n) === 0, detail: String(orphanFk.n) });

  // ---- not migrated ----
  const notMigrated: string[] = [];
  for (const [label, pool] of [
    [LP_DB, ctx.lp],
    [PN_DB, ctx.pn],
  ] as const) {
    const tables = await q<{ t: string }>(pool, "select table_name t from information_schema.tables where table_schema = database() order by 1");
    for (const { t } of tables) {
      if (INTERNAL.test(t) || t.startsWith("field_data_")) continue;
      const n = await count(pool, `\`${t}\``);
      if (!n) continue;
      const handled = HANDLED[t];
      if (!handled || handled.startsWith("NOT")) notMigrated.push(`| ${label} | ${t} | ${n} | ${handled ? handled.replace(/^NOT migrated: /, "") : "no target (not reviewed)"} |`);
    }
  }

  out();
  out("## Checks");
  out();
  for (const check of checks) out(`- ${check.ok ? "PASS" : "FAIL"} — ${check.name}: ${check.detail}`);
  out();
  out(`Account matching (Peer Navigation → Link Positively): ${byMatch.s || "none"}; Peer Navigation-only users: ${pnOnly.n}.`);
  out();
  out("## Legacy tables with data that are not migrated");
  out();
  out("Drupal internals (cache*, sessions, watchdog, accesslog, search_*, menu*, registry, system, variable, field config, views, blocks…) are not listed. Field tables (`field_data_*`) are read with their entities.");
  out();
  out("| db | table | rows | why |");
  out("|---|---|---:|---|");
  for (const line of notMigrated) out(line);

  if (stats) {
    out();
    out("## Last run (this process)");
    out();
    out("| table | source | inserted | updated | unchanged | skipped |");
    out("|---|---:|---:|---:|---:|---:|");
    for (const [name, s] of stats.tables) {
      out(`| ${name} | ${s.source} | ${s.inserted} | ${s.updated} | ${s.unchanged} | ${Object.values(s.skipped).reduce((a, b) => a + b, 0)} |`);
    }
    out();
    for (const [name, s] of stats.tables) {
      for (const [reason, n] of Object.entries(s.skipped)) out(`- ${name}: skipped ${n} — ${reason}`);
      for (const note of s.notes) out(`- ${name}: ${note}`);
    }
  }

  const file = path.join(process.cwd(), ".data", "migration-report.md");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${lines.join("\n")}\n`);
  console.log("\nVerification");
  for (const check of checks) console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
  console.log(`  Not migrated (non-internal tables with data): ${notMigrated.length} — see report`);
  console.log(`  Report: ${path.relative(process.cwd(), file)}`);
  const failed = checks.filter((c) => !c.ok).length;
  if (failed) process.exitCode = 1;
  return { checks, failed };
}

