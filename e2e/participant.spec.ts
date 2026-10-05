import { expect, test } from "@playwright/test";
import { dismissDialogs, statePath } from "./helpers";

test.describe("participant", () => {
  test.use({ storageState: statePath("participant") });

  test("daily check-in saves meds and mood @phone", async ({ page }) => {
    await page.goto("/tracker");
    await dismissDialogs(page);
    // If today is already answered the card is folded; open it to edit.
    const edit = page.getByRole("button", { name: /^edit/i }).first();
    if (await edit.isVisible().catch(() => false)) await edit.click();

    await page.getByRole("radio", { name: "Yes, I did" }).click();
    await expect(page.getByText("Nice work. Every dose counts.")).toBeVisible();

    const mood = page.getByRole("radio", { name: "Calm" });
    await mood.click();
    await expect(mood).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(page.getByText(/Calm/).first()).toBeVisible();
  });

  test("posting on the wall, then deleting the post", async ({ page }) => {
    await page.goto("/");
    await dismissDialogs(page);
    const text = `E2E post ${Date.now()}`;
    await page.locator('[contenteditable="true"]').first().click();
    await page.keyboard.type(text);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const post = page.locator("article", { hasText: text }).first();
    await expect(post).toBeVisible();

    await post.getByRole("button", { name: /more|options|actions/i }).first().click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    await page.getByRole("button", { name: /^delete/i }).last().click();
    await expect(page.locator("article", { hasText: text })).toHaveCount(0);
  });
});

test.describe("control arm", () => {
  test.use({ storageState: statePath("control") });

  test("sees the study welcome, not the feed", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
    await page.goto("/tracker");
    await expect(page).not.toHaveURL(/\/tracker$/);
  });
});
