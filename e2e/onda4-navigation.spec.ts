import { test, expect } from "@playwright/test";

test.describe("Onda 4 navigation", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Defina PLAYWRIGHT_BASE_URL (ex.: http://127.0.0.1:3000) com o app rodando para executar E2E."
    );
  });

  test("legacy /pt-BR/dashboard redirects to /pt-BR/portfolio", async ({ page }) => {
    const res = await page.goto("/pt-BR/dashboard", { waitUntil: "commit" });
    expect(res?.status() === 308 || res?.status() === 307 || res?.status() === 200).toBeTruthy();
    await page.waitForURL(/\/portfolio/, { timeout: 15_000 });
  });

  test("legacy /pt-BR/tasks redirects to /pt-BR/routines", async ({ page }) => {
    const res = await page.goto("/pt-BR/tasks", { waitUntil: "commit" });
    expect(res?.status() === 308 || res?.status() === 307 || res?.status() === 200).toBeTruthy();
    await page.waitForURL(/\/routines/, { timeout: 15_000 });
  });
});
