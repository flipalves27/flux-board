import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("apiFetch session refresh", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("uses a single in-flight POST /api/auth/refresh when parallel requests get 401", async () => {
    const { apiFetch } = await import("./api-client");

    const hits = { boards: 0, features: 0 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/auth/refresh")) {
        return new Response(null, { status: 200 });
      }
      if (url.includes("/api/boards")) {
        hits.boards += 1;
        if (hits.boards === 1) return new Response(null, { status: 401 });
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/api/org/features")) {
        hits.features += 1;
        if (hits.features === 1) return new Response(null, { status: 401 });
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const [r1, r2] = await Promise.all([apiFetch("/api/boards"), apiFetch("/api/org/features")]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const refreshCalls = fetchMock.mock.calls.filter((c) => {
      const u = typeof c[0] === "string" ? c[0] : (c[0] as Request).url;
      return u.includes("/api/auth/refresh");
    });
    expect(refreshCalls.length).toBe(1);
  });

  it("honors backoff after refresh returns 429 and does not spam refresh", async () => {
    const { apiFetch } = await import("./api-client");

    let refreshCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/auth/refresh")) {
        refreshCount += 1;
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "Retry-After": "3600" },
        });
      }
      return new Response(null, { status: 401 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await apiFetch("/api/boards");
    await apiFetch("/api/org/features");

    expect(refreshCount).toBe(1);
  });
});
