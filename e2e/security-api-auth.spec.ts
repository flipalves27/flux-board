import { test, expect } from "@playwright/test";

/**
 * Regressão mínima de segurança: APIs que exigem sessão não devem responder 200 sem cookies.
 * Requer app em execução e PLAYWRIGHT_BASE_URL (alinhado a e2e/smoke.spec.ts).
 */
test.describe("security API — sem sessão", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Defina PLAYWRIGHT_BASE_URL (ex.: http://127.0.0.1:3000) com o app rodando."
    );
  });

  test("GET /api/boards retorna 401 sem autenticação", async ({ request }) => {
    const res = await request.get("/api/boards");
    expect(res.status()).toBe(401);
  });

  test("GET /api/organizations/me retorna 401 sem autenticação", async ({ request }) => {
    const res = await request.get("/api/organizations/me");
    expect(res.status()).toBe(401);
  });

  test("GET /api/portal com token inválido retorna 404", async ({ request }) => {
    const res = await request.get("/api/portal/flux-pentest-invalid-token-00000000");
    expect(res.status()).toBe(404);
  });
});
