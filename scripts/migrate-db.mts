/**
 * Applies the SQL migrations in ./drizzle to DATABASE_URL (from .env.local,
 * else .env, else the environment). Safe to run repeatedly: already-applied
 * migrations are skipped (tracked in drizzle.__drizzle_migrations).
 *
 *   pnpm db:migrate
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: try the next one
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (add it to .env.local; `pnpm db` prints the local one).");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle({ client, casing: "snake_case" }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
