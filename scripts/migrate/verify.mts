/**
 * Verification report for the legacy migration. Runs automatically after
 * `pnpm migrate:legacy`, or on its own: `pnpm migrate:verify`.
 *
 * For every mapped Drupal source: source rows vs migrated rows (by legacy
 * ids), rows whose user doesn't exist (orphans: deleted Drupal accounts),
 * duplicate checks, and spot checks of sums (points per user, check-ins per
 * user, comments per post). Lists every non-internal legacy table with data
 * that is not migrated, and why. Writes .data/migration-report.md.
 * Output carries counts and ids only.
 */
import { runVerification } from "./lib/verify";
import { createDb, createLegacyPool, LP_DB, PN_DB } from "./lib/context";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const { client, db } = createDb(url);
const lp = createLegacyPool(LP_DB);
const pn = createLegacyPool(PN_DB);
try {
  await runVerification({ db, lp, pn });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.all([lp.end(), pn.end(), client.end()]);
}
