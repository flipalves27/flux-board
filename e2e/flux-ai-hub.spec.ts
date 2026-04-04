import { test, expect } from "@playwright/test";

test.describe("AI hub", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Defina PLAYWRIGHT_BASE_URL (ex.: http://127.0.0.1:3000) com o app rodando para executar E2E."
    );
  });

  test("locale AI hub redirects anonymous users to login", async ({ page }) => {
    const res = await page.goto("/pt-BR/ai");
    expect(res?.ok()).toBeTruthy();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page.locator("body")).toBeVisible();
  });
});
