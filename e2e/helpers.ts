import { expect, type Page } from "@playwright/test";

export const PASSWORD = "password123";
export const USERS = ["participant", "control", "coach", "pnonly", "coordinator"] as const;
export type TestUser = (typeof USERS)[number];

/** Saved session for a test user (created by global-setup.ts). */
export function statePath(username: TestUser) {
  return `e2e/.auth/${username}.json`;
}

/** Logs in through the real form (only for tests about the login page itself). */
export async function loginWithForm(page: Page, username: string, next = "/") {
  await page.goto(`/login${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`);
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Closes pop-ups that open shortly after arrival (survey reminder, level-up celebration). */
export async function dismissDialogs(page: Page) {
  for (let i = 0; i < 3; i++) {
    const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
    if (!(await dialog.waitFor({ state: "visible", timeout: i === 0 ? 8_000 : 2_000 }).then(() => true, () => false))) return;
    const later = dialog.getByRole("button", { name: /remind me tomorrow|not now|close|continue/i }).first();
    if (await later.isVisible().catch(() => false)) await later.click();
    else await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }
}
