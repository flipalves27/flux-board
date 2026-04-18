import { test, expect } from "@playwright/test";

test.describe("ux-v2 z-index tokens", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Defina PLAYWRIGHT_BASE_URL (ex.: http://127.0.0.1:3000) com o app rodando para executar E2E."
    );
  });

  test("root exposes stacking tokens", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.ok()).toBeTruthy();
    const zCommand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--flux-z-command-content").trim()
    );
    expect(zCommand).not.toBe("");
    expect(Number.isFinite(Number(zCommand))).toBeTruthy();
  });
});
