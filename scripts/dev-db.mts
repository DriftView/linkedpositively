/**
 * Local PostgreSQL for development: real Postgres binaries from npm
 * (embedded-postgres), no Docker or cloud account needed. Data is kept in
 * ./.data/pg between runs.
 *
 *   pnpm db           start it (leave it running), then in another terminal:
 *   pnpm db:migrate   create/update the tables
 *   pnpm db:stop      stop a cluster left running (e.g. the terminal was closed
 *                     instead of Ctrl+C; on Windows the server outlives a killed parent)
 *
 * DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/linkpositively
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const PORT = 54329;
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "linkpositively";
const dataDir = path.resolve(".data/pg");

/** pg_ctl from the platform package embedded-postgres installed (e.g. @embedded-postgres/windows-x64). */
async function pgCtl(...args: string[]) {
  const require = createRequire(import.meta.resolve("embedded-postgres"));
  const pkg = require.resolve(
    `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`,
  );
  const { pg_ctl } = (await import(pathToFileURL(pkg).href)) as { pg_ctl: string };
  return execFileSync(pg_ctl, [...args, "-D", dataDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function isRunning() {
  if (!existsSync(path.join(dataDir, "postmaster.pid"))) return false;
  try {
    await pgCtl("status");
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes("stop")) {
  if (await isRunning()) {
    await pgCtl("stop", "-m", "fast");
    console.log("PostgreSQL stopped.");
  } else console.log("PostgreSQL is not running.");
  process.exit(0);
}

if (await isRunning()) {
  console.log(`PostgreSQL is already running: postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`);
  console.log("Stop it with `pnpm db:stop`.");
  process.exit(0);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Always UTF-8: on Windows initdb otherwise picks the system code page
  // (e.g. WIN1252), which rejects emoji and most non-Latin text.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (message) => console.error(String(message).trim()),
});

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log("Creating a new database cluster in .data/pg…");
  await pg.initialise();
}
await pg.start();

const admin = postgres({
  host: "127.0.0.1",
  port: PORT,
  user: USER,
  password: PASSWORD,
  database: "postgres",
  onnotice: () => {},
});
try {
  const [row] = await admin`select 1 as ok from pg_database where datname = ${DATABASE}`;
  if (!row) {
    // Explicit encoding, so clusters created before initdbFlags above still get a UTF-8 database.
    await admin.unsafe(
      `create database "${DATABASE}" encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`,
    );
    console.log(`Created database "${DATABASE}". Run \`pnpm db:migrate\` to create the tables.`);
  }
  const [{ encoding }] = await admin`select pg_encoding_to_char(encoding) as encoding from pg_database where datname = ${DATABASE}`;
  if (encoding !== "UTF8") {
    console.error(
      `Database "${DATABASE}" uses ${encoding}, not UTF8; emoji and non-Latin text will fail.\n` +
        `Recreate it: stop with \`pnpm db:stop\`, delete .data/pg, run \`pnpm db\` and \`pnpm db:migrate\` again.`,
    );
  }
} finally {
  await admin.end();
}

console.log(`PostgreSQL ready: postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`);
console.log("Press Ctrl+C to stop. Data is kept in .data/pg.");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Keep the process alive until stopped.
setInterval(() => {}, 1 << 30);
