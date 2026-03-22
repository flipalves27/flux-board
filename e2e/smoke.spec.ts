import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Defina PLAYWRIGHT_BASE_URL (ex.: http://127.0.0.1:3000) com o app rodando para executar E2E."
    );
  });

  test("página de login carrega", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });
});
