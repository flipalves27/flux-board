import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/fluxy", () => {
  const prev = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  });

  it("returns llmEnabled false when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { llmEnabled?: boolean };
    expect(body.llmEnabled).toBe(false);
  });

  it("returns llmEnabled true when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await GET();
    const body = (await res.json()) as { llmEnabled?: boolean };
    expect(body.llmEnabled).toBe(true);
  });
});
