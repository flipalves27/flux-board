import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { getOAuthPublicBaseUrl, getOAuthRequestPublicOrigin } from "./base-url";

function reqWithHost(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers });
}

describe("getOAuthPublicBaseUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  it("uses NEXT_PUBLIC_APP_URL when request host matches", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    const req = reqWithHost("https://app.example.com/foo", {
      host: "app.example.com",
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
    });
    expect(getOAuthPublicBaseUrl(req)).toBe("https://app.example.com");
  });

  it("trims trailing space in NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/ ";
    const req = reqWithHost("https://app.example.com/foo", {
      host: "app.example.com",
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
    });
    expect(getOAuthPublicBaseUrl(req)).toBe("https://app.example.com");
  });

  it("prefers request origin when env host differs (www vs apex)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.example.com";
    const req = reqWithHost("https://example.com/start", {
      host: "example.com",
      "x-forwarded-host": "example.com",
      "x-forwarded-proto": "https",
    });
    expect(getOAuthPublicBaseUrl(req)).toBe("https://example.com");
  });

  it("falls back to forwarded host when env unset", () => {
    const req = reqWithHost("http://internal/any", {
      "x-forwarded-host": "myapp.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(getOAuthPublicBaseUrl(req)).toBe("https://myapp.vercel.app");
  });

  it("getOAuthRequestPublicOrigin matches forwarded host and proto", () => {
    const req = reqWithHost("http://internal/any", {
      "x-forwarded-host": "example.com",
      "x-forwarded-proto": "https",
    });
    expect(getOAuthRequestPublicOrigin(req)).toBe("https://example.com");
  });
});
