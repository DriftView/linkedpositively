import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app with seeded data:
 *   pnpm db && pnpm seed && (seed scripts) && pnpm dev
 *   pnpm test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  // The dev server compiles each page on first visit; allow for that.
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
});
