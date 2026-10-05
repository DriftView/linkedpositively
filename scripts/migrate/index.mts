/**
 * Legacy data migration: Drupal 7 (Link Positively + Peer Navigation, MySQL)
 * → PostgreSQL. Re-runnable: every write is an upsert keyed on the legacy
 * ids, so running it again converges and creates no duplicates.
 *
 *   pnpm migrate:legacy                        # everything, then the verification report
 *   pnpm migrate:legacy --only=users,community # some steps (dependencies must already be migrated)
 *   pnpm migrate:legacy --skip=files           # (or --skip-files) leave uploads alone
 *   pnpm migrate:legacy --dry-run              # read and map, write nothing
 *   pnpm migrate:legacy --no-verify
 *
 * Env: DATABASE_URL (target), LEGACY_MYSQL_URL (default mysql://root:legacy@127.0.0.1:33067),
 * LEGACY_PN_DB (default ecoach_a), LEGACY_FILES_ROOT (default ../../link-positively-legacy-data).
 * Logs carry counts and ids only — never personal data.
 */
import { createDb, createLegacyPool, LP_DB, PN_DB, Stats, type Ctx, type Options } from "./lib/context";
import { migrateUsers } from "./users";
import { migrateContent } from "./content";
import { migrateTips } from "./tips";
import { migrateResources } from "./resources";
import { migrateCommunity } from "./community";
import { migrateCheckin } from "./checkin";
import { migrateTracker } from "./tracker";
import { migrateGamification } from "./gamification";
import { migrateSms } from "./sms";
import { migrateSurveys } from "./surveys";
import { migrateSupport } from "./support";
import { migratePeerNav } from "./peer-nav";
import { migrateUsage } from "./usage";
import { runVerification } from "./lib/verify";

/** Steps in foreign-key order. Files are uploaded inside the steps that own them. */
export const STEPS: { name: string; run: (ctx: Ctx) => Promise<void> }[] = [
  { name: "users", run: migrateUsers }, // users, accounts, profiles
  { name: "content", run: migrateContent }, // pages, glossary, journey (+ user goals), level copy
  { name: "tips", run: migrateTips }, // tip tags, tips, favourites, views
  { name: "resources", run: migrateResources }, // resource tags, resources, favourites, reports
  { name: "community", run: migrateCommunity }, // posts, comments, reactions, reports, hashtags
  { name: "checkin", run: migrateCheckin }, // prompts, weekly + daily check-ins
  { name: "tracker", run: migrateTracker }, // trackers, entries, reminders
  { name: "gamification", run: migrateGamification }, // points, gamification states
  { name: "sms", run: migrateSms }, // sms sends, clicks
  { name: "surveys", run: migrateSurveys }, // survey config, responses
  { name: "support", run: migrateSupport }, // tech support tickets
  { name: "peer-nav", run: migratePeerNav }, // sessions, revisions, notes, files, threads, messages
  { name: "usage", run: migrateUsage }, // login sessions, usage events
];

function parseArgs(argv: string[]): Options {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const list = (value?: string) => (value ? new Set(value.split(",").map((s) => s.trim()).filter(Boolean)) : null);
  const skip = list(get("skip")) ?? new Set<string>();
  const skipFiles = argv.includes("--skip-files") || skip.has("files");
  return {
    only: list(get("only")),
    skip,
    dryRun: argv.includes("--dry-run"),
    skipFiles,
    verify: !argv.includes("--no-verify"),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const unknown = [...(opts.only ?? []), ...opts.skip].filter((s) => s !== "files" && !STEPS.some((step) => step.name === s));
  if (unknown.length) throw new Error(`Unknown step(s): ${unknown.join(", ")}. Steps: ${STEPS.map((s) => s.name).join(", ")}`);

  const { client, db } = createDb(url);
  const lp = createLegacyPool(LP_DB);
  const pn = createLegacyPool(PN_DB);
  const stats = new Stats();
  const started = Date.now();
  const ctx: Ctx = { db, lp, pn, opts, stats, log: (message) => console.log(message) };
  const target = new URL(url);
  console.log(
    `Legacy migration → ${target.host}${target.pathname} (lp + ${PN_DB})${opts.dryRun ? " [dry run]" : ""}${opts.skipFiles ? " [skip files]" : ""}`,
  );
  try {
    for (const step of STEPS) {
      if (opts.only && !opts.only.has(step.name)) continue;
      if (opts.skip.has(step.name)) continue;
      const t = Date.now();
      await step.run(ctx);
      console.log(`  ✓ ${step.name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    }
    printSummary(stats);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
    if (opts.verify && !opts.dryRun) await runVerification(ctx, stats);
  } finally {
    await Promise.all([lp.end(), pn.end(), client.end()]);
  }
}

function printSummary(stats: Stats) {
  const rows = [...stats.tables.entries()].map(([name, s]) => ({
    table: name,
    source: s.source,
    inserted: s.inserted,
    updated: s.updated,
    unchanged: s.unchanged,
    skipped: Object.values(s.skipped).reduce((a, b) => a + b, 0),
  }));
  console.table(rows);
  for (const [name, s] of stats.tables) {
    for (const [reason, count] of Object.entries(s.skipped)) console.log(`  - ${name}: skipped ${count} (${reason})`);
    for (const note of s.notes) console.log(`  - ${name}: ${note}`);
  }
}

/** Errors without query parameters or row values (they can hold personal data). */
function safeError(error: unknown) {
  const e = error as { cause?: unknown; code?: string; constraint_name?: string; table_name?: string; column_name?: string; message?: string; stack?: string };
  const root = (e?.cause ?? e) as typeof e;
  const parts = [root?.code && `code ${root.code}`, root?.table_name && `table ${root.table_name}`, root?.column_name && `column ${root.column_name}`, root?.constraint_name && `constraint ${root.constraint_name}`].filter(Boolean);
  const message = (root?.message ?? String(error)).split("\n")[0].replace(/params:.*$/, "");
  const where = (e?.stack ?? "").split("\n").filter((l) => l.includes("scripts")).slice(0, 3).join("\n");
  return `${message}${parts.length ? ` (${parts.join(", ")})` : ""}\n${where}`;
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
