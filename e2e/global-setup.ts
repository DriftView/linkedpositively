import { request, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { PASSWORD, USERS, statePath } from "./helpers";

/**
 * Signs each test user in once and saves the session, so tests don't hit the
 * login rate limit (8 attempts a minute).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000";
  mkdirSync("e2e/.auth", { recursive: true });
  for (const username of USERS) {
    const context = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
    const response = await context.post("/api/auth/sign-in/username", { data: { username, password: PASSWORD } });
    if (!response.ok()) throw new Error(`Couldn't sign in ${username}: ${response.status()}`);
    await context.storageState({ path: statePath(username) });
    await context.dispose();
  }
}
