import { expect, test } from "@playwright/test";
import { dismissDialogs, statePath } from "./helpers";

/**
 * AI Coach. Works with or without ANTHROPIC_API_KEY: without one, every reply
 * is the defined fallback, which is enough to exercise the conversation,
 * cards, feedback, history, safety alerts and access rules.
 */

test.describe("AI Coach, participant", () => {
  test.use({ storageState: statePath("participant") });

  test("asks a question, rates the reply, finds it in history and clears it @phone", async ({ page }) => {
    await page.goto("/ai-coach");
    await dismissDialogs(page);
    const question = `What is PEP? (e2e ${Date.now()})`;
    await page.getByLabel("Message your coach").fill(question);
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("listitem").getByText(question)).toBeVisible();
    const helpful = page.getByRole("button", { name: "Helpful", exact: true }).last();
    await expect(helpful).toBeVisible({ timeout: 90_000 });
    await expect(page).toHaveURL(/\/ai-coach\?c=/);
    await helpful.click();
    await expect(helpful).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Your conversations" }).first().click();
    const title = question.slice(0, 40);
    const row = page.getByRole("dialog").getByRole("link", { name: new RegExp(title.replace(/[?()]/g, "\\$&")) });
    await expect(row).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: /^Clear “/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page).toHaveURL(/\/ai-coach$/);
  });

  test("shows crisis lines and alerts staff when someone may be in danger", async ({ page }) => {
    await page.goto("/ai-coach");
    await dismissDialogs(page);
    await page.getByLabel("Message your coach").fill("I don't want to be alive anymore");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Help is available right now" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("link", { name: /Call or text 988/ }).first()).toBeVisible();
  });

  test("coach settings save the chosen look", async ({ page }) => {
    await page.goto("/ai-coach");
    await dismissDialogs(page);
    await page.getByRole("button", { name: "Coach settings" }).first().click();
    const kai = page.getByRole("radio", { name: /Kai/ });
    await kai.click();
    await expect(kai).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(500);
    await page.reload();
    await page.getByRole("button", { name: "Coach settings" }).first().click();
    await expect(page.getByRole("radio", { name: /Kai/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: /Amara/ }).click();
  });
});

test.describe("AI Coach, access", () => {
  test.describe("control arm", () => {
    test.use({ storageState: statePath("control") });

    test("has no AI Coach", async ({ page }) => {
      await page.goto("/ai-coach");
      await expect(page).not.toHaveURL(/\/ai-coach/);
      await expect(page.getByRole("link", { name: "AI Coach" })).toHaveCount(0);
    });
  });

  test.describe("Peer Navigation participant", () => {
    test.use({ storageState: statePath("pnonly") });

    test("opens the coach from the coaching area", async ({ page }) => {
      await page.goto("/coaching/ai-coach");
      await expect(page.getByLabel("Message your coach")).toBeVisible();
    });
  });
});

test.describe("AI Coach, staff", () => {
  test.use({ storageState: statePath("coordinator") });

  test("reviews a safety alert", async ({ page }) => {
    await page.goto("/admin/ai/alerts?status=all");
    const first = page.locator('a[href^="/admin/ai/alerts/"]').first();
    test.skip(!(await first.isVisible().catch(() => false)), "no alerts yet (run the participant crisis test first)");
    await first.click();
    await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
    await page.getByRole("radio", { name: "In review" }).click();
    await page.getByLabel(/Staff note/).fill("Called the participant (e2e).");
    await page.getByRole("button", { name: "Save follow-up" }).click();
    await expect(page.getByText("Alert updated")).toBeVisible();
  });

  test("sees the overview and the knowledge base", async ({ page }) => {
    await page.goto("/admin/ai");
    await expect(page.getByText("Members using the coach")).toBeVisible();
    await page.goto("/admin/ai/knowledge");
    await expect(page.getByRole("heading", { name: "AI Coach knowledge" })).toBeVisible();
  });
});
