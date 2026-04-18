import { describe, expect, it } from "vitest";
import { classifyIntentLocalSync } from "@/lib/fluxy-intent-local";

describe("classifyIntentLocalSync", () => {
  it("detects nav_boards in pt-BR", () => {
    const r = classifyIntentLocalSync("ir para boards", "pt-BR");
    expect(r.intent).toBe("nav_boards");
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it("detects nav_portfolio in en", () => {
    const r = classifyIntentLocalSync("open portfolio dashboard", "en");
    expect(r.intent).toBe("nav_portfolio");
  });

  it("detects board_nlq phrasing", () => {
    const r = classifyIntentLocalSync("pesquisar cards urgentes", "pt-BR");
    expect(r.intent).toBe("board_nlq");
  });

  it("detects board_new_card in en", () => {
    const r = classifyIntentLocalSync("create a new card for bugfix", "en");
    expect(r.intent).toBe("board_new_card");
  });

  it("returns unknown for empty", () => {
    const r = classifyIntentLocalSync("   ", "pt-BR");
    expect(r.intent).toBe("unknown");
    expect(r.confidence).toBe(0);
  });
});
