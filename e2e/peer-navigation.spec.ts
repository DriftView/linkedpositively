import { expect, test } from "@playwright/test";
import { statePath } from "./helpers";

test.describe("coach", () => {
  test.use({ storageState: statePath("coach") });

  test("only sees their own participants", async ({ page }) => {
    await page.goto("/coach");
    await expect(page.getByText(/Morgan/).first()).toBeVisible();
    await expect(page.getByText("Sam Participant")).toHaveCount(0);
  });
});

test.describe("Peer Navigation participant", () => {
  test.use({ storageState: statePath("pnonly") });

  test("sees their coaching plan and coach @phone", async ({ page }) => {
    await page.goto("/coaching");
    await expect(page.getByText("Introduction and Intake").first()).toBeVisible();
    await page.goto("/coaching/coach");
    await expect(page.getByText(/Jordan/).first()).toBeVisible();
  });

  test("can't open the coach workspace", async ({ page }) => {
    await page.goto("/coach");
    await expect(page).not.toHaveURL(/\/coach$/);
  });
});
