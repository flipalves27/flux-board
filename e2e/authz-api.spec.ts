import { test, expect } from "@playwright/test";

test.describe("api authz", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Defina PLAYWRIGHT_BASE_URL (ex.: http://127.0.0.1:3000) com o app rodando para executar E2E."
    );
  });

  test("rota protegida retorna 401 sem sessão", async ({ request }) => {
    const res = await request.get("/api/users");
    expect(res.status()).toBe(401);
  });

  test("rota de board retorna 403 para token sem acesso", async ({ request }) => {
    const boardId = process.env.PLAYWRIGHT_FORBIDDEN_BOARD_ID;
    const token = process.env.PLAYWRIGHT_FORBIDDEN_BEARER_TOKEN;
    test.skip(!boardId || !token, "Defina PLAYWRIGHT_FORBIDDEN_BOARD_ID e PLAYWRIGHT_FORBIDDEN_BEARER_TOKEN.");

    const res = await request.get(`/api/boards/${encodeURIComponent(boardId!)}`, {
      headers: {
        Authorization: `Bearer ${token!}`,
      },
    });

    expect(res.status()).toBe(403);
  });
});
