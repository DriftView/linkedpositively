import { expect, test } from "@playwright/test";
import { loginWithForm, statePath } from "./helpers";

test.describe("signed out", () => {
  test("visitors are sent to login and back to their page @phone", async ({ page }) => {
    await page.goto("/tips");
    await expect(page).toHaveURL(/\/login\?next=%2Ftips/);
    await loginWithForm(page, "participant", "/tips");
    await expect(page).toHaveURL(/\/tips$/);
  });

  test("a wrong password shows a friendly error and the reset link", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username or email").fill("participant");
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/doesn't match|Too many attempts/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  });
});

test.describe("coach", () => {
  test.use({ storageState: statePath("coach") });
  test("lands in the coach workspace", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/coach/);
  });
});

test.describe("Peer Navigation-only participant", () => {
  test.use({ storageState: statePath("pnonly") });
  test("lands in coaching", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/coaching/);
  });
});

test.describe("participant", () => {
  test.use({ storageState: statePath("participant") });
  test("old Drupal links still work", async ({ page }) => {
    await page.goto("/drupal-wall");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/thrive-tips/favs");
    await expect(page).toHaveURL(/\/tips\/favorites$/);
    await page.goto("/my-tracking");
    await expect(page).toHaveURL(/\/tracker$/);
  });
});
