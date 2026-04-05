import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  assertOAuthRequestHostAllowed,
  parseOAuthAllowedPublicOriginsFromEnv,
  OAUTH_ERROR_ALLOWLIST_MISCONFIGURED,
  OAUTH_ERROR_HOST_NOT_ALLOWED,
} from "./allowed-public-origins";

function reqWithHost(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers });
}

describe("parseOAuthAllowedPublicOriginsFromEnv", () => {
  afterEach(() => {
    delete process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS;
  });

  it("returns empty when unset", () => {
    expect(parseOAuthAllowedPublicOriginsFromEnv()).toEqual({ ok: true, origins: [] });
  });

  it("parses CSV and strips paths to origin", () => {
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS =
      "https://www.example.com,https://example.com/foo";
    expect(parseOAuthAllowedPublicOriginsFromEnv()).toEqual({
      ok: true,
      origins: ["https://www.example.com", "https://example.com"],
    });
  });

  it("parses JSON array", () => {
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS =
      '["https://www.flux-board.com","https://flux-board.com"]';
    expect(parseOAuthAllowedPublicOriginsFromEnv()).toEqual({
      ok: true,
      origins: ["https://www.flux-board.com", "https://flux-board.com"],
    });
  });

  it("fails on invalid JSON array content", () => {
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS = "[1,2]";
    expect(parseOAuthAllowedPublicOriginsFromEnv()).toEqual({ ok: false });
  });

  it("fails on invalid URL", () => {
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS = "not-a-url";
    expect(parseOAuthAllowedPublicOriginsFromEnv()).toEqual({ ok: false });
  });
});

describe("assertOAuthRequestHostAllowed", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    delete process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS;
  });

  it("does not block when NODE_ENV is not production", () => {
    process.env.NODE_ENV = "test";
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS = "https://allowed.example";
    const req = reqWithHost("https://other.example/start", {
      host: "other.example",
      "x-forwarded-proto": "https",
    });
    expect(assertOAuthRequestHostAllowed(req, true)).toBeNull();
  });

  it("does not block in production when oauth is inactive", () => {
    process.env.NODE_ENV = "production";
    delete process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS;
    const req = reqWithHost("https://any.example/start", {
      host: "any.example",
      "x-forwarded-proto": "https",
    });
    expect(assertOAuthRequestHostAllowed(req, false)).toBeNull();
  });

  it("returns 503 when production, oauth active, and allowlist unset", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS;
    const req = reqWithHost("https://www.example.com/start", {
      host: "www.example.com",
      "x-forwarded-proto": "https",
    });
    const res = assertOAuthRequestHostAllowed(req, true);
    expect(res?.status).toBe(503);
    expect(await res!.json()).toEqual({ error: OAUTH_ERROR_ALLOWLIST_MISCONFIGURED });
  });

  it("returns 403 when host not in allowlist", async () => {
    process.env.NODE_ENV = "production";
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS = "https://www.example.com";
    const req = reqWithHost("https://evil.example/start", {
      host: "evil.example",
      "x-forwarded-proto": "https",
    });
    const res = assertOAuthRequestHostAllowed(req, true);
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: OAUTH_ERROR_HOST_NOT_ALLOWED });
  });

  it("allows www and apex when both listed", () => {
    process.env.NODE_ENV = "production";
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS =
      "https://www.example.com,https://example.com";
    const apex = reqWithHost("https://example.com/start", {
      host: "example.com",
      "x-forwarded-proto": "https",
    });
    expect(assertOAuthRequestHostAllowed(apex, true)).toBeNull();
    const www = reqWithHost("https://www.example.com/start", {
      host: "www.example.com",
      "x-forwarded-proto": "https",
    });
    expect(assertOAuthRequestHostAllowed(www, true)).toBeNull();
  });
});
