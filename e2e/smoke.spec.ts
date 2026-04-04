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

  test("landing pt-BR: hero e âncoras principais", async ({ page }) => {
    const res = await page.goto("/pt-BR");
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("#landing-hero-heading")).toBeVisible();
    await expect(page.locator("#landing-main")).toBeVisible();
    await expect(page.locator("#pricing")).toBeAttached();
    await expect(page.locator("#spotlight")).toBeAttached();
    await expect(page.locator("#faq")).toBeAttached();
  });

  test("landing en: hero e âncoras principais", async ({ page }) => {
    const res = await page.goto("/en");
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("#landing-hero-heading")).toBeVisible();
    await expect(page.locator("#spotlight")).toBeAttached();
    await expect(page.locator("#trust")).toBeAttached();
  });
});
