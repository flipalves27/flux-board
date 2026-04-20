import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  callFluxAi: vi.fn(async () => ({
    ok: true as const,
    text: JSON.stringify({
      summary: "Resumo teste",
      wentWell: [{ text: "Bom" }],
      improve: [{ text: "Melhorar" }],
      actions: [{ text: "Agir" }],
    }),
    provider: "together" as const,
    model: "test",
  })),
}));

describe("ceremony-retrospective", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports generateRetrospective", async () => {
    const mod = await import("./ceremony-retrospective");
    expect(typeof mod.generateRetrospective).toBe("function");
  });
});
