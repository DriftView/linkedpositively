import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes SQL migrations to ./drizzle from the schema;
// `pnpm db:migrate` applies them (scripts/migrate-db.mts). DATABASE_URL comes
// from .env.local (only needed for drizzle-kit commands that connect, e.g. studio).
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: fall back to the local dev database below
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/linkpositively" },
  strict: true,
  verbose: true,
});
