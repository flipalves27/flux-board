import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { boardsApiCorsHeaders } from "./cors-allowlist";

describe("boardsApiCorsHeaders", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("returns wildcard headers when ALLOW_PUBLIC_BOARDS_CORS=1", async () => {
    process.env.ALLOW_PUBLIC_BOARDS_CORS = "1";
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "development";
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", { headers: {} });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("*");
    expect(h["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("does not allow wildcard in production even when legacy flag is set", async () => {
    process.env.ALLOW_PUBLIC_BOARDS_CORS = "1";
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", {
      headers: { origin: "https://app.example.com" },
    });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
  });

  it("reflects Origin when it matches allowlist from NEXT_PUBLIC_APP_URL", async () => {
    delete process.env.ALLOW_PUBLIC_BOARDS_CORS;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    delete process.env.VERCEL_URL;
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", {
      headers: { origin: "https://app.example.com" },
    });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
  });

  it("uses single allowed origin when Origin missing and only one allowed", async () => {
    delete process.env.ALLOW_PUBLIC_BOARDS_CORS;
    process.env.NEXT_PUBLIC_APP_URL = "https://solo.test";
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", { headers: {} });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://solo.test");
  });

  it("adds VERCEL_URL to allowlist", async () => {
    delete process.env.ALLOW_PUBLIC_BOARDS_CORS;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.VERCEL_URL = "my-app.vercel.app";
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", {
      headers: { origin: "https://my-app.vercel.app" },
    });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://my-app.vercel.app");
  });

  it("merges ALLOWED_CORS_ORIGINS", async () => {
    delete process.env.ALLOW_PUBLIC_BOARDS_CORS;
    process.env.NEXT_PUBLIC_APP_URL = "https://a.com";
    process.env.ALLOWED_CORS_ORIGINS = " https://extra.test , https://b.com/ ";
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", {
      headers: { origin: "https://extra.test" },
    });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://extra.test");
  });

  it("falls back to localhost origins in dev when no app URL", async () => {
    delete process.env.ALLOW_PUBLIC_BOARDS_CORS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "development";
    const { boardsApiCorsHeaders: headers } = await import("./cors-allowlist");
    const req = new NextRequest("http://localhost/api/boards", {
      headers: { origin: "http://localhost:3000" },
    });
    const h = headers(req);
    expect(h["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });
});
