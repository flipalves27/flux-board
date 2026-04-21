import { test, expect } from "@playwright/test";

/**
 * Isolamento multi-tenant (IDOR): opcional — exige credenciais e ID de board de outra org.
 *
 * Variáveis:
 * - PLAYWRIGHT_BASE_URL
 * - PLAYWRIGHT_SECURITY_USER_A_EMAIL / PLAYWRIGHT_SECURITY_USER_A_PASSWORD
 * - PLAYWRIGHT_SECURITY_BOARD_ORG_B_ID (board que o utilizador A não deve ler)
 *
 * Executa login na UI e tenta ler o board da org B; espera 403 ou 404 (nunca 200 com dados).
 */
test.describe("security — isolamento tenant (opcional)", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL ||
        !process.env.PLAYWRIGHT_SECURITY_USER_A_EMAIL ||
        !process.env.PLAYWRIGHT_SECURITY_USER_A_PASSWORD ||
        !process.env.PLAYWRIGHT_SECURITY_BOARD_ORG_B_ID,
      "Defina PLAYWRIGHT_BASE_URL e PLAYWRIGHT_SECURITY_* (email, password, BOARD_ORG_B_ID) para este teste."
    );
  });

  test("utilizador A não obtém board da org B via API", async ({ page }) => {
    const email = process.env.PLAYWRIGHT_SECURITY_USER_A_EMAIL!;
    const password = process.env.PLAYWRIGHT_SECURITY_USER_A_PASSWORD!;
    const foreignBoardId = process.env.PLAYWRIGHT_SECURITY_BOARD_ORG_B_ID!;

    await page.goto("/login");
    await page.locator('input[name="user"]').fill(email);
    await page.locator('input[name="password"]').first().fill(password);
    await Promise.all([
      page.waitForURL(/\/boards/, { timeout: 30_000 }),
      page.locator('form').filter({ has: page.locator('input[name="user"]') }).locator('button[type="submit"]').click(),
    ]);

    const res = await page.request.get(`/api/boards/${encodeURIComponent(foreignBoardId)}`);
    const status = res.status();
    expect([403, 404], `GET /api/boards/{idAlheio} deve negar; recebido ${status}`).toContain(status);
  });
});
