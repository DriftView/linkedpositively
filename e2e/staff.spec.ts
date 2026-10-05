import { expect, test } from "@playwright/test";
import { statePath } from "./helpers";

test.describe("coordinator", () => {
  test.use({ storageState: statePath("coordinator") });

  test("reaches the user list and moderation", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Sam Participant").first()).toBeVisible();
    await page.goto("/admin/moderation");
    await expect(page).toHaveURL(/\/admin\/moderation/);
  });
});

test.describe("participant", () => {
  test.use({ storageState: statePath("participant") });

  test("can't open staff pages", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users/);
  });
});
