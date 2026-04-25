import { describe, expect, it } from "vitest";
import { hashCacheKey } from "@/lib/ai-completion-cache";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";

/**
 * Contrato de cache: o hash do brief executivo inclui FLUX_LLM_PROMPT_VERSION.
 * Ao alterar o prompt em board-executive-brief-ai, incremente prompt-versions
 * para invalidar entradas antigas no Mongo.
 */
describe("executive brief AI cache key contract", () => {
  it("changes when prompt version changes (regression guard)", () => {
    const base = ["org1", "board1", "2026-01-01T00:00:00.000Z", "executive"];
    const a = hashCacheKey([...base.slice(0, 3), FLUX_LLM_PROMPT_VERSION, base[3]!]);
    const b = hashCacheKey([...base.slice(0, 3), "legacy-prompt-version", base[3]!]);
    expect(a).not.toBe(b);
    expect(a.length).toBe(64);
  });
});
