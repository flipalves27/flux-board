import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/fluxy", () => {
  const prevKey = process.env.TOGETHER_API_KEY;
  const prevModel = process.env.TOGETHER_MODEL;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.TOGETHER_API_KEY;
    else process.env.TOGETHER_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.TOGETHER_MODEL;
    else process.env.TOGETHER_MODEL = prevModel;
  });

  it("returns llmEnabled false when OpenAI-compat server env is incomplete", async () => {
    delete process.env.TOGETHER_API_KEY;
    delete process.env.TOGETHER_MODEL;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { llmEnabled?: boolean };
    expect(body.llmEnabled).toBe(false);
  });

  it("returns llmEnabled true when TOGETHER_API_KEY and TOGETHER_MODEL are set", async () => {
    process.env.TOGETHER_API_KEY = "test-key";
    process.env.TOGETHER_MODEL = "test-model";
    const res = await GET();
    const body = (await res.json()) as { llmEnabled?: boolean };
    expect(body.llmEnabled).toBe(true);
  });
});
