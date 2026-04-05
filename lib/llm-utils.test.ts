import { afterEach, describe, expect, it, vi } from "vitest";
import { callTogetherApi, extractTextFromLlmContent, safeJsonParse } from "./llm-utils";

describe("extractTextFromLlmContent", () => {
  it("returns empty string for null and undefined", () => {
    expect(extractTextFromLlmContent(null)).toBe("");
    expect(extractTextFromLlmContent(undefined)).toBe("");
  });

  it("returns strings as-is", () => {
    expect(extractTextFromLlmContent("hello")).toBe("hello");
    expect(extractTextFromLlmContent("café 日本語")).toBe("café 日本語");
  });

  it("joins array parts using text or content", () => {
    expect(
      extractTextFromLlmContent([{ text: "a" }, { content: "b" }, { text: "c", content: "ignored" }])
    ).toBe("abc");
  });

  it("flattens nested content arrays", () => {
    expect(
      extractTextFromLlmContent([
        { content: [{ text: "outer" }, { content: " inner" }] },
        { text: " end" },
      ])
    ).toBe("outer inner end");
  });

  it("trims joined array output", () => {
    expect(extractTextFromLlmContent([{ text: "  x  " }, { text: " y " }])).toBe("x   y");
  });

  it("uses String fallback for non-array non-string", () => {
    expect(extractTextFromLlmContent(42)).toBe("42");
    expect(extractTextFromLlmContent(true)).toBe("true");
  });

  it("ignores plain objects inside array parts", () => {
    expect(extractTextFromLlmContent([{}, { foo: 1 }])).toBe("");
  });

  it("handles string fragments inside nested arrays", () => {
    expect(extractTextFromLlmContent([{ content: ["a", "b"] }])).toBe("ab");
  });

  it("treats null entries inside arrays as empty fragments", () => {
    expect(extractTextFromLlmContent([null, { text: "a" }])).toBe("a");
  });

  it("stringifies non-object primitives nested in content arrays", () => {
    expect(extractTextFromLlmContent([{ content: [99, { text: "x" }] }])).toBe("99x");
  });
});

describe("safeJsonParse", () => {
  it("returns null for empty input", () => {
    expect(safeJsonParse("")).toBeNull();
    expect(safeJsonParse("   ")).toBeNull();
    expect(safeJsonParse(undefined as unknown as string)).toBeNull();
  });

  it("strips markdown fences and parses", () => {
    const raw = "```json\n{\"a\":1}\n```";
    expect(safeJsonParse<{ a: number }>(raw)).toEqual({ a: 1 });
  });

  it("extracts first brace span when surrounded by prose", () => {
    const raw = 'here: {"x":"y"} trailing';
    expect(safeJsonParse<{ x: string }>(raw)).toEqual({ x: "y" });
  });

  it("parses first object when trailing prose contains closing braces", () => {
    const raw = '{"cardRows":[]}\n\nTexto extra com chave: } no fim.';
    expect(safeJsonParse<{ cardRows: unknown[] }>(raw)).toEqual({ cardRows: [] });
  });

  it("respects braces inside JSON strings when extracting object", () => {
    const raw = 'x {"a":"literal } brace","b":1} tail';
    expect(safeJsonParse<{ a: string; b: number }>(raw)).toEqual({ a: "literal } brace", b: 1 });
  });

  it("parses whole string when no braces are found", () => {
    expect(safeJsonParse('"ok"')).toBe("ok");
  });

  it("uses full string when braces are unbalanced (last before first)", () => {
    expect(safeJsonParse("not json")).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    expect(safeJsonParse("{not json}")).toBeNull();
  });

  it("preserves unicode", () => {
    expect(safeJsonParse('{"msg":"αβγ 你好"}')).toEqual({ msg: "αβγ 你好" });
  });

  it("infers generic type at compile-time (runtime object shape)", () => {
    const v = safeJsonParse<{ k: boolean }>('{"k":true}');
    expect(v).toEqual({ k: true });
  });
});

describe("callTogetherApi", () => {
  const originalKey = process.env.TOGETHER_API_KEY;
  const originalBase = process.env.TOGETHER_BASE_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env.TOGETHER_API_KEY = originalKey;
    process.env.TOGETHER_BASE_URL = originalBase;
  });

  it("fails when api key missing", async () => {
    delete process.env.TOGETHER_API_KEY;
    const r = await callTogetherApi({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("no_api_key");
  });

  it("fails when api key is whitespace", async () => {
    process.env.TOGETHER_API_KEY = "   ";
    const r = await callTogetherApi({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("no_api_key");
  });

  it("uses opts.apiKey over env", async () => {
    delete process.env.TOGETHER_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: [{ text: "ok" }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await callTogetherApi(
      { model: "m", messages: [{ role: "user", content: "hi" }] },
      { apiKey: "k", baseUrl: "https://example.com/v1/" }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assistantText).toBe("ok");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer k",
        }),
      })
    );
  });

  it("returns http error with body snippet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "upstream failure",
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await callTogetherApi(
      { model: "m", messages: [] },
      { apiKey: "k", baseUrl: "https://x/v1" }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("http_502");
      expect(r.bodySnippet).toBe("upstream failure");
    }
  });

  it("handles text() rejection on error response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error("boom");
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await callTogetherApi({ model: "m", messages: [] }, { apiKey: "k" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bodySnippet).toBe("");
  });

  it("returns invalid_json_response when body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad");
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await callTogetherApi({ model: "m", messages: [] }, { apiKey: "k" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_json_response");
  });

  it("maps fetch throw to error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const r = await callTogetherApi({ model: "m", messages: [] }, { apiKey: "k" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("network down");
  });

  it("maps non-Error fetch throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("weird"));
    const r = await callTogetherApi({ model: "m", messages: [] }, { apiKey: "k" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("network_error");
  });

  it("extracts assistant text from string content in success payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }),
      })
    );
    const r = await callTogetherApi({ model: "m", messages: [] }, { apiKey: "k" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.assistantText).toBe('{"a":1}');
  });

  it("uses TOGETHER_BASE_URL from env when opts omits baseUrl", async () => {
    process.env.TOGETHER_API_KEY = "k";
    process.env.TOGETHER_BASE_URL = "https://env-base.example/v3/";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "hi" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await callTogetherApi({ model: "m", messages: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://env-base.example/v3/chat/completions",
      expect.any(Object)
    );
  });

  it("uses default Together base URL when env has no TOGETHER_BASE_URL", async () => {
    delete process.env.TOGETHER_BASE_URL;
    process.env.TOGETHER_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "x" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await callTogetherApi({ model: "m", messages: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.together.xyz/v1/chat/completions",
      expect.any(Object)
    );
  });
});
